import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import jwt from 'jsonwebtoken';
import { stringify } from 'csv-stringify/sync';
import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';
import { eq, desc } from 'drizzle-orm';

import { db } from './src/db/index.js';
import {
  leads,
  telegramRules,
  telegramChats,
  adminUsers,
  adminLogs,
  apiTokens,
  analyticsIntegrations,
  messageSettings,
} from './src/db/schema.js';
import {
  buildAuthUrl,
  createPkce,
  exchangeCode,
  randomState,
  verifyIdToken,
} from './src/lib/telegram-oidc.js';
import { hasPermission, type AuthUser, type Permission, type Role } from './src/lib/permissions.js';
import { parseLeadFilters, queryLeads } from './src/lib/leads-query.js';
import { forwardToAnalytics } from './src/lib/analytics.js';
import { formatPostbackMessage, routeTelegramNotifications, DEFAULT_MESSAGE_FIELDS, ALL_MESSAGE_FIELDS, type PostbackParams } from './src/lib/postback.js';
import { registerChatTracker, listActiveChats } from './src/lib/chat-tracker.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = Number(process.env.PORT) || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const SUPER_ADMIN_ID = process.env.SUPER_ADMIN_TG_ID || '6730949764';

// Telegram OpenID Connect (new Login Widget 2.0)
const TG_CLIENT_ID = process.env.TELEGRAM_CLIENT_ID || '';
const TG_CLIENT_SECRET = process.env.TELEGRAM_CLIENT_SECRET || '';
const DOMAIN = process.env.DOMAIN || `localhost:${PORT}`;
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL || (DOMAIN.startsWith('localhost') ? `http://${DOMAIN}` : `https://${DOMAIN}`);
const OIDC_REDIRECT_URI = `${PUBLIC_BASE_URL}/api/auth/telegram/callback`;

// Short-lived store for PKCE verifier + state (single-instance)
const oauthStateStore = new Map<string, { verifier: string; exp: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of oauthStateStore) {
    if (value.exp < now) oauthStateStore.delete(key);
  }
}, 60_000).unref();

const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: true }) : null;
if (bot) {
  registerChatTracker(bot);
}

interface AuthRequest extends express.Request {
  user?: AuthUser;
}

const authenticateToken = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err || !user || typeof user !== 'object') return res.sendStatus(403);
    req.user = user as AuthUser;
    next();
  });
};

const requirePermission = (permission: Permission) => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user || !hasPermission(req.user, permission)) {
      return res.status(403).json({ error: `Permission required: ${permission}` });
    }
    next();
  };
};

const logAdminAction = async (adminTgId: string, action: string, details: unknown) => {
  try {
    await db.insert(adminLogs).values({
      admin_tg_id: adminTgId,
      action,
      details,
    });
  } catch (error) {
    console.error('Failed to log admin action', error);
  }
};

const sendLeadsResponse = (
  res: express.Response,
  results: unknown[],
  exportCsv: boolean
) => {
  if (exportCsv) {
    const csvData = stringify(results, { header: true });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
    return res.send(csvData);
  }

  return res.json({
    total: results.length,
    data: results,
  });
};

const ensureSuperAdmin = async () => {
  try {
    const existing = await db.select().from(adminUsers).where(eq(adminUsers.tg_id, SUPER_ADMIN_ID));
    if (existing.length === 0) {
      await db.insert(adminUsers).values({
        tg_id: SUPER_ADMIN_ID,
        role: 'superadmin',
        name: 'Super Admin',
      });
      console.log('Superadmin created');
    }
  } catch (error) {
    console.log('DB might not be initialized yet', error);
  }
};

ensureSuperAdmin();

// Cache message fields (invalidated on settings update)
let cachedMessageFields: string[] | null = null;

async function getMessageFields(): Promise<string[]> {
  if (cachedMessageFields) return cachedMessageFields;
  try {
    const rows = await db.select().from(messageSettings);
    if (rows.length > 0 && Array.isArray(rows[0].fields)) {
      cachedMessageFields = rows[0].fields as string[];
    } else {
      cachedMessageFields = DEFAULT_MESSAGE_FIELDS;
    }
  } catch {
    cachedMessageFields = DEFAULT_MESSAGE_FIELDS;
  }
  return cachedMessageFields;
}

// --- POSTBACK ---
app.all('/api/postback', async (req, res) => {
  const params = { ...req.query, ...req.body };

  const type = String(params.type || '');
  const trader_id = String(params.trader_id || 'N/A');
  const country = String(params.country || 'N/A');
  const sumdep = String(params.sumdep || '0');
  const tg_id = String(params.tg_id || 'N/A');
  const tg_username = String(params.tg_username || params.username || 'N/A');
  const click_id = String(params.click_id || 'N/A');
  const partner = String(params.partner || 'default');

  if (!type) return res.status(400).send('type is required');

  const knownTypes = ['REG', 'FTD', 'DEP', 'WTD'];
  if (!knownTypes.includes(type)) return res.status(400).send('unknown type');

  try {
    const [savedLead] = await db
      .insert(leads)
      .values({ type, trader_id, country, sumdep, tg_id, tg_username, click_id, partner })
      .returning();

    const pbParams: PostbackParams = { type, trader_id, country, sumdep, tg_id, tg_username, click_id, partner };
    const fields = await getMessageFields();
    const text = formatPostbackMessage(pbParams, fields);

    await routeTelegramNotifications(bot, BOT_TOKEN, partner, type, text);

    forwardToAnalytics({
      type, trader_id, country, sumdep, tg_id, click_id, partner,
      created_at: savedLead.created_at || new Date(),
    });

    res.send('ok');
  } catch (error) {
    console.error('Postback error', error);
    res.status(500).send('Server Error');
  }
});

// --- AUTH (Telegram OpenID Connect) ---
// Step 1: redirect user to Telegram authorization endpoint
app.get('/api/auth/telegram/login', async (_req, res) => {
  if (!TG_CLIENT_ID || !TG_CLIENT_SECRET) {
    return res.status(500).send('TELEGRAM_CLIENT_ID / TELEGRAM_CLIENT_SECRET not configured');
  }

  try {
    const state = randomState();
    const { verifier, challenge } = createPkce();
    oauthStateStore.set(state, { verifier, exp: Date.now() + 10 * 60_000 });

    const url = await buildAuthUrl({
      clientId: TG_CLIENT_ID,
      redirectUri: OIDC_REDIRECT_URI,
      scope: 'openid profile',
      state,
      challenge,
    });

    res.redirect(url);
  } catch (error) {
    console.error('OIDC login error', error);
    res.status(500).send('Failed to start login');
  }
});

// Step 2: callback — exchange code, verify id_token, issue app JWT
app.get('/api/auth/telegram/callback', async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';

  const entry = oauthStateStore.get(state);
  if (!code || !entry || entry.exp < Date.now()) {
    return res.redirect('/?auth_error=invalid_state');
  }
  oauthStateStore.delete(state);

  try {
    const tokens = await exchangeCode({
      code,
      redirectUri: OIDC_REDIRECT_URI,
      clientId: TG_CLIENT_ID,
      clientSecret: TG_CLIENT_SECRET,
      verifier: entry.verifier,
    });

    if (!tokens.id_token) {
      return res.redirect('/?auth_error=no_id_token');
    }

    const payload = await verifyIdToken(tokens.id_token, TG_CLIENT_ID);
    // Telegram puts the real numeric Telegram user ID in the `id` claim.
    // `sub` is a pairwise/opaque identifier and must NOT be used for matching.
    const tgId = String(payload.id || '');
    if (!tgId) {
      console.warn('OIDC: no `id` claim in id_token', payload);
      return res.redirect('/?auth_error=no_sub');
    }

    const users = await db.select().from(adminUsers).where(eq(adminUsers.tg_id, tgId));
    if (users.length === 0) {
      console.warn(`OIDC: tg_id ${tgId} is not in admin_users`);
      return res.redirect('/?auth_error=not_admin');
    }

    const user = users[0];
    const displayName =
      user.name ||
      (typeof payload.name === 'string' ? payload.name : '') ||
      (typeof payload.preferred_username === 'string' ? payload.preferred_username : '') ||
      'Admin';

    const authUser: AuthUser = {
      id: user.tg_id,
      role: user.role as Role,
      name: displayName,
      permissions: (user.permissions as Permission[]) || undefined,
    };

    const token = jwt.sign(authUser, JWT_SECRET, { expiresIn: '24h' });
    await logAdminAction(user.tg_id, 'LOGIN', { ip: req.ip, method: 'oidc' });

    res.redirect(`/?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('OIDC callback error', error);
    res.redirect('/?auth_error=server_error');
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthRequest, res) => {
  res.json(req.user);
});

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/auth/test', async (req, res) => {
    const authUser: AuthUser = {
      id: SUPER_ADMIN_ID,
      role: 'superadmin',
      name: 'Test Super Admin',
    };
    const token = jwt.sign(authUser, JWT_SECRET, { expiresIn: '24h' });
    await logAdminAction(SUPER_ADMIN_ID, 'TEST_LOGIN', { ip: req.ip });
    res.json({ token, user: authUser });
  });
}

// --- EXTERNAL API (token-based) ---
app.get('/api/v1/leads', async (req, res) => {
  const token =
    (typeof req.query.token === 'string' ? req.query.token : null) ||
    (req.headers['x-api-token'] as string | undefined);

  if (!token) {
    return res.status(401).json({ error: 'API token required' });
  }

  try {
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.token, token));
    const apiToken = rows[0];

    if (!apiToken || !apiToken.is_active) {
      return res.status(403).json({ error: 'Invalid or inactive token' });
    }

    const permissions = (apiToken.permissions as string[]) || ['read_leads'];
    if (!permissions.includes('read_leads')) {
      return res.status(403).json({ error: 'Token has no read_leads permission' });
    }

    await db
      .update(apiTokens)
      .set({ last_used_at: new Date() })
      .where(eq(apiTokens.id, apiToken.id));

    const filters = parseLeadFilters(req.query as Record<string, unknown>);
    const results = await queryLeads(filters);
    const exportCsv = req.query.format === 'csv' || req.query.export_csv === 'true';

    return sendLeadsResponse(res, results, exportCsv);
  } catch (error) {
    console.error('External API error', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ADMIN: LEADS ---
app.get('/api/leads', authenticateToken, requirePermission('view_leads'), async (req: AuthRequest, res) => {
  try {
    const filters = parseLeadFilters(req.query as Record<string, unknown>);
    const results = await queryLeads(filters);
    const exportCsv = req.query.export_csv === 'true';

    await logAdminAction(req.user!.id, exportCsv ? 'EXPORT_LEADS' : 'VIEW_LEADS', {
      filter: req.query,
    });

    return sendLeadsResponse(res, results, exportCsv);
  } catch (error) {
    console.error('Error fetching leads', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ADMIN: TELEGRAM CHATS (auto-discovered) ---
app.get('/api/chats', authenticateToken, requirePermission('manage_rules'), async (_req, res) => {
  try {
    const chats = await listActiveChats();
    res.json(chats);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Manually add/verify a chat by ID (for chats added before polling started)
app.post('/api/chats', authenticateToken, requirePermission('manage_rules'), async (req: AuthRequest, res) => {
  const { chat_id } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id is required' });

  if (!bot) return res.status(500).json({ error: 'Bot not configured' });

  try {
    const chat = await bot.getChat(String(chat_id)) as any;
    await db
      .insert(telegramChats)
      .values({
        chat_id: String(chat.id),
        title: chat.title || chat.username || String(chat.id),
        type: chat.type,
        is_active: true,
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: telegramChats.chat_id,
        set: { title: chat.title || chat.username || String(chat.id), is_active: true, updated_at: new Date() },
      });
    res.json({ chat_id: String(chat.id), title: chat.title || chat.username, type: chat.type });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to get chat info. Is the bot an admin there?' });
  }
});

// --- ADMIN: ROUTING RULES ---
app.get('/api/rules', authenticateToken, requirePermission('manage_rules'), async (_req, res) => {
  try {
    const rules = await db.select().from(telegramRules).orderBy(desc(telegramRules.created_at));
    res.json(rules);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.post('/api/rules', authenticateToken, requirePermission('manage_rules'), async (req: AuthRequest, res) => {
  const { partner, conversion_type, conversion_types, target_chat_id } = req.body;

  if (!target_chat_id) {
    return res.status(400).json({ error: 'target_chat_id is required' });
  }

  // Accept a single conversion_type or an array of conversion_types
  let types: string[] = Array.isArray(conversion_types) && conversion_types.length > 0
    ? conversion_types
    : [conversion_type || '*'];
  // If '*' is among them, it covers everything
  if (types.includes('*')) types = ['*'];
  types = [...new Set(types)];

  try {
    const created = await db
      .insert(telegramRules)
      .values(
        types.map((type) => ({
          partner: partner || 'default',
          conversion_type: type,
          target_chat_id: String(target_chat_id),
        }))
      )
      .returning();

    await logAdminAction(req.user!.id, 'CREATE_RULE', { partner, types, target_chat_id });
    res.json(created);
  } catch {
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

app.delete('/api/rules/:id', authenticateToken, requirePermission('manage_rules'), async (req: AuthRequest, res) => {
  try {
    await db.delete(telegramRules).where(eq(telegramRules.id, Number(req.params.id)));
    await logAdminAction(req.user!.id, 'DELETE_RULE', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

// --- ADMIN: USERS ---
app.get('/api/admins', authenticateToken, requirePermission('manage_admins'), async (_req, res) => {
  try {
    const admins = await db.select().from(adminUsers).orderBy(desc(adminUsers.created_at));
    res.json(admins);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.post('/api/admins', authenticateToken, requirePermission('manage_admins'), async (req: AuthRequest, res) => {
  const { tg_id, role, name, permissions } = req.body;

  if (!tg_id) {
    return res.status(400).json({ error: 'tg_id is required' });
  }

  try {
    const [admin] = await db
      .insert(adminUsers)
      .values({
        tg_id: String(tg_id),
        role: role || 'admin',
        name,
        permissions: permissions || null,
      })
      .returning();

    await logAdminAction(req.user!.id, 'ADD_ADMIN', { tg_id, role, permissions });
    res.json(admin);
  } catch {
    res.status(500).json({ error: 'Failed to add admin' });
  }
});

app.patch('/api/admins/:id', authenticateToken, requirePermission('manage_admins'), async (req: AuthRequest, res) => {
  const { role, name, permissions } = req.body;

  try {
    const [admin] = await db
      .update(adminUsers)
      .set({ role, name, permissions: permissions ?? null })
      .where(eq(adminUsers.id, Number(req.params.id)))
      .returning();

    await logAdminAction(req.user!.id, 'UPDATE_ADMIN', { id: req.params.id, role, permissions });
    res.json(admin);
  } catch {
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

app.delete('/api/admins/:id', authenticateToken, requirePermission('manage_admins'), async (req: AuthRequest, res) => {
  try {
    await db.delete(adminUsers).where(eq(adminUsers.id, Number(req.params.id)));
    await logAdminAction(req.user!.id, 'DELETE_ADMIN', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete admin' });
  }
});

// --- ADMIN: API TOKENS ---
app.get('/api/tokens', authenticateToken, requirePermission('manage_tokens'), async (_req, res) => {
  try {
    const tokens = await db.select().from(apiTokens).orderBy(desc(apiTokens.created_at));
    res.json(tokens);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.post('/api/tokens', authenticateToken, requirePermission('manage_tokens'), async (req: AuthRequest, res) => {
  const { name, permissions } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }

  const token = crypto.randomBytes(32).toString('hex');

  try {
    const [created] = await db
      .insert(apiTokens)
      .values({
        name,
        token,
        permissions: permissions || ['read_leads'],
        created_by: req.user!.id,
      })
      .returning();

    await logAdminAction(req.user!.id, 'CREATE_API_TOKEN', { name, id: created.id });
    res.json(created);
  } catch {
    res.status(500).json({ error: 'Failed to create token' });
  }
});

app.patch('/api/tokens/:id', authenticateToken, requirePermission('manage_tokens'), async (req: AuthRequest, res) => {
  const { is_active, name, permissions } = req.body;

  try {
    const [updated] = await db
      .update(apiTokens)
      .set({
        ...(name !== undefined && { name }),
        ...(permissions !== undefined && { permissions }),
        ...(is_active !== undefined && { is_active }),
      })
      .where(eq(apiTokens.id, Number(req.params.id)))
      .returning();

    await logAdminAction(req.user!.id, 'UPDATE_API_TOKEN', { id: req.params.id });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update token' });
  }
});

app.delete('/api/tokens/:id', authenticateToken, requirePermission('manage_tokens'), async (req: AuthRequest, res) => {
  try {
    await db.delete(apiTokens).where(eq(apiTokens.id, Number(req.params.id)));
    await logAdminAction(req.user!.id, 'DELETE_API_TOKEN', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete token' });
  }
});

// --- ADMIN: ANALYTICS ---
app.get('/api/analytics', authenticateToken, requirePermission('manage_analytics'), async (_req, res) => {
  try {
    const integrations = await db.select().from(analyticsIntegrations).orderBy(desc(analyticsIntegrations.created_at));
    res.json(integrations);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.post('/api/analytics', authenticateToken, requirePermission('manage_analytics'), async (req: AuthRequest, res) => {
  const { name, webhook_url, events } = req.body;

  if (!name || !webhook_url) {
    return res.status(400).json({ error: 'name and webhook_url are required' });
  }

  try {
    const [integration] = await db
      .insert(analyticsIntegrations)
      .values({
        name,
        webhook_url,
        events: events || ['*'],
      })
      .returning();

    await logAdminAction(req.user!.id, 'CREATE_ANALYTICS', { name, id: integration.id });
    res.json(integration);
  } catch {
    res.status(500).json({ error: 'Failed to create integration' });
  }
});

app.patch('/api/analytics/:id', authenticateToken, requirePermission('manage_analytics'), async (req: AuthRequest, res) => {
  const { name, webhook_url, events, is_active } = req.body;

  try {
    const [updated] = await db
      .update(analyticsIntegrations)
      .set({
        ...(name !== undefined && { name }),
        ...(webhook_url !== undefined && { webhook_url }),
        ...(events !== undefined && { events }),
        ...(is_active !== undefined && { is_active }),
      })
      .where(eq(analyticsIntegrations.id, Number(req.params.id)))
      .returning();

    await logAdminAction(req.user!.id, 'UPDATE_ANALYTICS', { id: req.params.id });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update integration' });
  }
});

app.delete('/api/analytics/:id', authenticateToken, requirePermission('manage_analytics'), async (req: AuthRequest, res) => {
  try {
    await db.delete(analyticsIntegrations).where(eq(analyticsIntegrations.id, Number(req.params.id)));
    await logAdminAction(req.user!.id, 'DELETE_ANALYTICS', { id: req.params.id });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// --- ADMIN: MESSAGE SETTINGS ---
app.get('/api/message-settings', authenticateToken, requirePermission('manage_rules'), async (_req, res) => {
  try {
    const rows = await db.select().from(messageSettings);
    if (rows.length > 0) {
      res.json({ fields: rows[0].fields, allFields: ALL_MESSAGE_FIELDS });
    } else {
      res.json({ fields: DEFAULT_MESSAGE_FIELDS, allFields: ALL_MESSAGE_FIELDS });
    }
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.put('/api/message-settings', authenticateToken, requirePermission('manage_rules'), async (req: AuthRequest, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields) || fields.length === 0) {
    return res.status(400).json({ error: 'fields must be a non-empty array' });
  }
  const validFields = fields.filter((f: string) => ALL_MESSAGE_FIELDS.includes(f));
  try {
    const rows = await db.select().from(messageSettings);
    if (rows.length > 0) {
      await db.update(messageSettings).set({ fields: validFields, updated_at: new Date() }).where(eq(messageSettings.id, rows[0].id));
    } else {
      await db.insert(messageSettings).values({ fields: validFields });
    }
    cachedMessageFields = validFields;
    await logAdminAction(req.user!.id, 'UPDATE_MESSAGE_SETTINGS', { fields: validFields });
    res.json({ fields: validFields });
  } catch {
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// --- ADMIN: LOGS ---
app.get('/api/logs', authenticateToken, requirePermission('view_logs'), async (_req, res) => {
  try {
    const logs = await db.select().from(adminLogs).orderBy(desc(adminLogs.created_at)).limit(200);
    res.json(logs);
  } catch {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// --- HEALTH ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, dotfiles: 'deny' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
