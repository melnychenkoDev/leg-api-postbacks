import { eq } from 'drizzle-orm';
import TelegramBot from 'node-telegram-bot-api';
import { db } from '../db/index.js';
import { telegramRules } from '../db/schema.js';

export interface PostbackParams {
  type: string;
  trader_id: string;
  country: string;
  sumdep: string;
  tg_id: string;
  tg_username: string;
  click_id: string;
  partner: string;
}

const TYPE_EMOJI: Record<string, string> = {
  REG: '☑️REG',
  FTD: '✅FTD',
  DEP: '✅🔄DEP',
  WTD: '💸WTD',
};

const FIELD_LABELS: Record<string, { emoji: string; label: string; getValue: (p: PostbackParams) => string }> = {
  type:         { emoji: '',  label: '',         getValue: p => TYPE_EMOJI[p.type] || `❓${p.type}` },
  trader_id:    { emoji: '🆔', label: 'ID',      getValue: p => p.trader_id },
  country:      { emoji: '🌍', label: 'GEO',     getValue: p => p.country },
  sumdep:       { emoji: '💰', label: 'SUM',     getValue: p => p.sumdep },
  tg_id:        { emoji: '👤', label: 'TG_ID',   getValue: p => p.tg_id },
  tg_username:  { emoji: '📎', label: 'TG',      getValue: p => p.tg_username !== 'N/A' ? `@${p.tg_username}` : 'N/A' },
  partner:      { emoji: '🤝', label: 'Partner', getValue: p => p.partner },
  click_id:     { emoji: '🔗', label: 'Click',   getValue: p => p.click_id },
};

export const ALL_MESSAGE_FIELDS = Object.keys(FIELD_LABELS);

export const DEFAULT_MESSAGE_FIELDS = ['type', 'trader_id', 'country', 'sumdep', 'tg_id', 'tg_username'];

export function formatPostbackMessage(params: PostbackParams, fields: string[] = DEFAULT_MESSAGE_FIELDS): string {
  const parts: string[] = [];

  for (const field of fields) {
    const def = FIELD_LABELS[field];
    if (!def) continue;

    const value = def.getValue(params);
    if (!value || value === 'N/A' || value === '0') {
      if (field === 'type') parts.push(value);
      continue;
    }

    if (field === 'type') {
      parts.push(value);
    } else {
      parts.push(`${def.emoji}${value}`);
    }
  }

  return parts.join(' ');
}

export async function routeTelegramNotifications(
  bot: TelegramBot | null,
  botToken: string,
  partner: string,
  type: string,
  text: string
) {
  if (!bot || !botToken) return;

  const rules = await db.select().from(telegramRules).where(eq(telegramRules.partner, partner));
  const sentChats = new Set<string>();

  for (const rule of rules) {
    if (rule.conversion_type !== '*' && rule.conversion_type !== type) continue;
    if (sentChats.has(rule.target_chat_id)) continue;

    try {
      await bot.sendMessage(rule.target_chat_id, text);
      sentChats.add(rule.target_chat_id);
    } catch (error) {
      console.error(`Error sending TG to ${rule.target_chat_id}:`, error);
    }
  }
}
