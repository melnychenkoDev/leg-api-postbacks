import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  Webhook,
  FileText,
  Download,
  ShieldPlus,
  Trash2,
  Plus,
  KeyRound,
  BarChart3,
  Search,
  Copy,
  Settings2,
} from 'lucide-react';

type Role = 'superadmin' | 'admin' | 'viewer';

interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  superadmin: ['*'],
  admin: ['view_leads', 'export_leads', 'manage_rules'],
  viewer: ['view_leads'],
};

function canAccess(user: AuthUser | null, permission: string) {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

const CONVERSION_TYPES = ['*', 'REG', 'FTD', 'DEP', 'WTD'];

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [activeTab, setActiveTab] = useState('leads');

  const [leads, setLeads] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [admins, setAdmins] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsMeta, setLogsMeta] = useState({ total: 0, page: 1, pages: 1 });
  const [logsSearch, setLogsSearch] = useState('');
  const [logsPage, setLogsPage] = useState(1);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);

  const [leadFilters, setLeadFilters] = useState<Record<string, string>>({
    date_from: '',
    date_to: '',
    country: '',
    tg_id: '',
    tg_username: '',
    trader_id: '',
    click_id: '',
    partner: '',
    type: '',
  });

  const [msgSettings, setMsgSettings] = useState<Record<string, string[]>>({});
  const [allMsgFields, setAllMsgFields] = useState<string[]>([]);

  const [chats, setChats] = useState<any[]>([]);
  const [manualChatId, setManualChatId] = useState('');
  const [newRule, setNewRule] = useState<{ partner: string; conversion_types: string[]; target_chat_id: string }>({
    partner: 'default',
    conversion_types: ['*'],
    target_chat_id: '',
  });
  const [newAdmin, setNewAdmin] = useState({ tg_id: '', role: 'admin', name: '' });
  const [newTokenName, setNewTokenName] = useState('');
  const [newAnalytics, setNewAnalytics] = useState({ name: '', webhook_url: '', events: '*' });

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }),
    [token]
  );

  const apiFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: { ...authHeaders, ...(options.headers || {}) },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    },
    [authHeaders]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const authError = params.get('auth_error');

    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authError) {
      const messages: Record<string, string> = {
        not_admin: 'Этот Telegram-аккаунт не админ.',
        invalid_state: 'Сессия входа истекла, попробуйте ещё раз.',
        no_id_token: 'Telegram не вернул id_token.',
        no_sub: 'Не удалось получить Telegram ID.',
        server_error: 'Ошибка сервера при входе.',
      };
      alert(messages[authError] || `Auth error: ${authError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((u) => {
        if (u.id) setUser(u);
        else {
          setToken(null);
          localStorage.removeItem('token');
        }
      })
      .catch(() => {
        setToken(null);
        localStorage.removeItem('token');
      });
  }, [token]);

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(leadFilters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    const data = await apiFetch(`/api/leads?${params.toString()}`);
    setLeads(Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []);
  }, [apiFetch, leadFilters]);

  const loadTab = useCallback(async () => {
    if (!token || !user) return;

    try {
      if (activeTab === 'leads' && canAccess(user, 'view_leads')) {
        await loadLeads();
      } else if (activeTab === 'rules' && canAccess(user, 'manage_rules')) {
        const [rulesData, chatsData] = await Promise.all([apiFetch('/api/rules'), apiFetch('/api/chats')]);
        setRules(rulesData);
        setChats(chatsData);
      } else if (activeTab === 'admins' && canAccess(user, 'manage_admins')) {
        setAdmins(await apiFetch('/api/admins'));
      } else if (activeTab === 'tokens' && canAccess(user, 'manage_tokens')) {
        setApiTokens(await apiFetch('/api/tokens'));
      } else if (activeTab === 'analytics' && canAccess(user, 'manage_analytics')) {
        setAnalytics(await apiFetch('/api/analytics'));
      } else if (activeTab === 'logs' && canAccess(user, 'view_logs')) {
        const d = await apiFetch(`/api/logs?page=${logsPage}&limit=50&search=${encodeURIComponent(logsSearch)}`);
        setLogs(d.data || []);
        setLogsMeta({ total: d.total || 0, page: d.page || 1, pages: d.pages || 1 });
      } else if (activeTab === 'msg-settings' && canAccess(user, 'manage_rules')) {
        const data = await apiFetch('/api/message-settings');
        setMsgSettings(data.settings || {});
        setAllMsgFields(data.allFields || []);
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [activeTab, token, user, apiFetch, loadLeads, logsPage, logsSearch]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const handleTestLogin = async () => {
    try {
      const res = await fetch('/api/auth/test', { method: 'POST' });
      const data = await res.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
      }
    } catch {
      alert('Test login failed');
    }
  };

  const handleExportCSV = async () => {
    const params = new URLSearchParams({ export_csv: 'true' });
    Object.entries(leadFilters).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });

    const res = await fetch(`/api/leads?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white py-8 px-4 shadow rounded-lg sm:px-10 text-center flex flex-col items-center">
          <ShieldPlus className="mx-auto h-12 w-12 text-blue-600 mb-4" />
          <h2 className="text-center text-3xl font-extrabold text-gray-900 mb-6">Postback Admin</h2>
          <p className="text-gray-500 mb-6">Login with your authorized Telegram account.</p>
          <a
            href="/api/auth/telegram/login"
            className="bg-[#229ED9] hover:bg-[#1c8dc2] text-white px-6 py-3 rounded-md w-full transition-colors font-medium flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161l-1.97 9.293c-.146.658-.537.818-1.089.51l-3.012-2.22-1.453 1.398c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.203-.657-.643.135-.953l11.57-4.461c.538-.196 1.006.121.832.948z" />
            </svg>
            Войти через Telegram
          </a>

          <div className="mt-8 border-t pt-6 text-sm text-gray-400 w-full">
            <p className="mb-4">Dev mode only</p>
            <button
              onClick={handleTestLogin}
              className="bg-gray-800 text-white px-4 py-2 rounded-md hover:bg-gray-700 w-full transition-colors font-medium"
            >
              Bypass Login (Test Mode)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex">
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 text-xl font-bold border-b border-slate-800 flex items-center">
          <Webhook className="mr-2" /> Tracker Admin
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {canAccess(user, 'view_leads') && (
            <NavItem icon={<FileText />} label="Leads" active={activeTab === 'leads'} onClick={() => setActiveTab('leads')} />
          )}
          {canAccess(user, 'manage_rules') && (
            <NavItem icon={<Webhook />} label="Routing Rules" active={activeTab === 'rules'} onClick={() => setActiveTab('rules')} />
          )}
          {canAccess(user, 'manage_tokens') && (
            <NavItem icon={<KeyRound />} label="API Tokens" active={activeTab === 'tokens'} onClick={() => setActiveTab('tokens')} />
          )}
          {canAccess(user, 'manage_analytics') && (
            <NavItem icon={<BarChart3 />} label="Analytics" active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} />
          )}
          {canAccess(user, 'manage_admins') && (
            <NavItem icon={<Users />} label="Admins" active={activeTab === 'admins'} onClick={() => setActiveTab('admins')} />
          )}
          {canAccess(user, 'manage_rules') && (
            <NavItem icon={<Settings2 />} label="Message Settings" active={activeTab === 'msg-settings'} onClick={() => setActiveTab('msg-settings')} />
          )}
          {canAccess(user, 'view_logs') && (
            <NavItem icon={<LayoutDashboard />} label="Audit Logs" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 text-sm">
          <div>Logged in: {user?.name || user?.id}</div>
          <div className="text-slate-400 capitalize">{user?.role}</div>
          <button
            onClick={() => {
              localStorage.removeItem('token');
              setToken(null);
            }}
            className="mt-2 text-red-400 hover:text-red-300"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex-1 p-8 overflow-auto">
        {activeTab === 'leads' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Leads & Conversions</h1>
              {canAccess(user, 'export_leads') && (
                <button onClick={handleExportCSV} className="bg-blue-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-blue-700">
                  <Download className="mr-2 h-4 w-4" /> Export CSV
                </button>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(leadFilters).map(([key, value]) => (
                <input
                  key={key}
                  value={value}
                  onChange={(e) => setLeadFilters({ ...leadFilters, [key]: e.target.value })}
                  placeholder={key.replace('_', ' ')}
                  className="border rounded px-3 py-2 text-sm"
                />
              ))}
              <button onClick={loadLeads} className="bg-slate-800 text-white rounded px-4 py-2 flex items-center justify-center">
                <Search className="h-4 w-4 mr-2" /> Filter
              </button>
            </div>

            <DataTable
              headers={['Date', 'Type', 'Deposit', 'Country', 'Trader ID', 'Partner', 'TG ID', 'TG Username', 'WTD Status', 'Click ID']}
              rows={leads.map((lead) => [
                new Date(lead.created_at).toLocaleString(),
                lead.type,
                lead.sumdep || 0,
                lead.country,
                lead.trader_id,
                lead.partner,
                lead.tg_id,
                lead.tg_username ? `@${lead.tg_username}` : '—',
                lead.wtd_status || '—',
                lead.click_id,
              ])}
            />
          </div>
        )}

        {activeTab === 'rules' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Routing Rules</h1>

            <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 mb-6 text-sm">
              <p className="mb-2">Добавь бота <span className="font-semibold">@{import.meta.env.VITE_TG_BOT_NAME || 'your_bot'}</span> администратором в канал/группу — он появится в списке ниже автоматически.</p>
              <p className="text-xs text-blue-600">Если бот уже добавлен, но канал не появился — введи chat_id вручную:</p>
              <div className="flex gap-2 mt-2">
                <input
                  value={manualChatId}
                  onChange={(e) => setManualChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="border border-blue-300 rounded px-2 py-1 text-sm text-gray-800 w-48"
                />
                <button
                  onClick={async () => {
                    if (!manualChatId.trim()) return;
                    try {
                      const result = await apiFetch('/api/chats', { method: 'POST', body: JSON.stringify({ chat_id: manualChatId.trim() }) });
                      alert(`Добавлен: ${result.title || result.chat_id}`);
                      setManualChatId('');
                      const [rulesData, chatsData] = await Promise.all([apiFetch('/api/rules'), apiFetch('/api/chats')]);
                      setRules(rulesData);
                      setChats(chatsData);
                    } catch (e: any) {
                      alert('Ошибка: ' + e.message);
                    }
                  }}
                  className="bg-blue-600 text-white rounded px-3 py-1 text-sm hover:bg-blue-700"
                >
                  Добавить
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6 space-y-4">
              <h3 className="font-medium">Add Rule</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Partner</label>
                  <input
                    placeholder="default"
                    value={newRule.partner}
                    onChange={(e) => setNewRule({ ...newRule, partner: e.target.value })}
                    className="border rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Channel</label>
                  <select
                    value={newRule.target_chat_id}
                    onChange={(e) => setNewRule({ ...newRule, target_chat_id: e.target.value })}
                    className="border rounded px-3 py-2 w-full"
                  >
                    <option value="">— выбери канал —</option>
                    {chats.map((c) => (
                      <option key={c.chat_id} value={c.chat_id}>
                        {c.title} ({c.chat_id})
                      </option>
                    ))}
                  </select>
                  {chats.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">Каналы не найдены. Добавь бота админом в канал.</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-2">Events</label>
                <div className="flex flex-wrap gap-2">
                  {CONVERSION_TYPES.map((t) => {
                    const label = t === '*' ? 'All' : t;
                    const active = newRule.conversion_types.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setNewRule((prev) => {
                            if (t === '*') return { ...prev, conversion_types: ['*'] };
                            const without = prev.conversion_types.filter((x) => x !== '*');
                            const next = without.includes(t)
                              ? without.filter((x) => x !== t)
                              : [...without, t];
                            return { ...prev, conversion_types: next.length ? next : ['*'] };
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                          active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!newRule.target_chat_id) {
                    alert('Выбери канал');
                    return;
                  }
                  await apiFetch('/api/rules', { method: 'POST', body: JSON.stringify(newRule) });
                  setNewRule({ partner: 'default', conversion_types: ['*'], target_chat_id: '' });
                  loadTab();
                }}
                className="bg-blue-600 text-white rounded px-4 py-2 flex items-center justify-center"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Rule
              </button>
            </div>

            <div className="space-y-3">
              {rules.map((r) => {
                const chat = chats.find((c) => c.chat_id === r.target_chat_id);
                return (
                  <div key={r.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                    <div>
                      <span className="font-bold">{r.partner}</span> → [{r.conversion_type === '*' ? 'All' : r.conversion_type}] →{' '}
                      <span className="text-blue-600">{chat ? `${chat.title} (${r.target_chat_id})` : r.target_chat_id}</span>
                    </div>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/rules/${r.id}`, { method: 'DELETE' });
                        loadTab();
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'tokens' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">API Tokens</h1>
            <div className="bg-white rounded-lg shadow p-6 mb-6 flex gap-3">
              <input
                placeholder="Token name"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="border rounded px-3 py-2 flex-1"
              />
              <button
                onClick={async () => {
                  const created = await apiFetch('/api/tokens', {
                    method: 'POST',
                    body: JSON.stringify({ name: newTokenName }),
                  });
                  setNewTokenName('');
                  alert(`Token created:\n${created.token}\n\nSave it now — it won't be shown again.`);
                  loadTab();
                }}
                className="bg-blue-600 text-white rounded px-4 py-2"
              >
                Generate
              </button>
            </div>

            <div className="bg-white rounded-lg shadow p-4 mb-4 text-sm text-gray-600">
              External API: <code>GET /api/v1/leads?token=YOUR_TOKEN</code>
              <br />
              Filters: date_from, date_to, country, tg_id, trader_id, click_id, partner, type
              <br />
              CSV: add <code>format=csv</code>
            </div>

            <div className="space-y-3">
              {apiTokens.map((t) => (
                <div key={t.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-gray-500 font-mono">{t.token.slice(0, 12)}...</div>
                    <div className="text-xs text-gray-400">
                      {t.is_active ? 'Active' : 'Disabled'} · Last used:{' '}
                      {t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'never'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyText(t.token)} className="text-blue-600">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/tokens/${t.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_active: !t.is_active }),
                        });
                        loadTab();
                      }}
                      className="text-sm text-gray-600"
                    >
                      {t.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/tokens/${t.id}`, { method: 'DELETE' });
                        loadTab();
                      }}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Analytics Integrations</h1>
            <div className="bg-white rounded-lg shadow p-6 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="Name"
                value={newAnalytics.name}
                onChange={(e) => setNewAnalytics({ ...newAnalytics, name: e.target.value })}
                className="border rounded px-3 py-2"
              />
              <input
                placeholder="Webhook URL"
                value={newAnalytics.webhook_url}
                onChange={(e) => setNewAnalytics({ ...newAnalytics, webhook_url: e.target.value })}
                className="border rounded px-3 py-2 md:col-span-2"
              />
              <select
                value={newAnalytics.events}
                onChange={(e) => setNewAnalytics({ ...newAnalytics, events: e.target.value })}
                className="border rounded px-3 py-2"
              >
                {CONVERSION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                onClick={async () => {
                  await apiFetch('/api/analytics', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...newAnalytics,
                      events: [newAnalytics.events],
                    }),
                  });
                  setNewAnalytics({ name: '', webhook_url: '', events: '*' });
                  loadTab();
                }}
                className="bg-blue-600 text-white rounded px-4 py-2 md:col-span-4"
              >
                Add Integration
              </button>
            </div>

            <div className="space-y-3">
              {analytics.map((a) => (
                <div key={a.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-sm text-blue-600">{a.webhook_url}</div>
                    <div className="text-xs text-gray-500">Events: {JSON.stringify(a.events)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/analytics/${a.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ is_active: !a.is_active }),
                        });
                        loadTab();
                      }}
                      className="text-sm text-gray-600"
                    >
                      {a.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={async () => {
                        await apiFetch(`/api/analytics/${a.id}`, { method: 'DELETE' });
                        loadTab();
                      }}
                      className="text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'admins' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Users</h1>
            <div className="bg-white rounded-lg shadow p-6 mb-6 grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                placeholder="Telegram ID"
                value={newAdmin.tg_id}
                onChange={(e) => setNewAdmin({ ...newAdmin, tg_id: e.target.value })}
                className="border rounded px-3 py-2"
              />
              <input
                placeholder="Name"
                value={newAdmin.name}
                onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })}
                className="border rounded px-3 py-2"
              />
              <select
                value={newAdmin.role}
                onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value })}
                className="border rounded px-3 py-2"
              >
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
                <option value="superadmin">Superadmin</option>
              </select>
              <button
                onClick={async () => {
                  await apiFetch('/api/admins', { method: 'POST', body: JSON.stringify(newAdmin) });
                  setNewAdmin({ tg_id: '', role: 'admin', name: '' });
                  loadTab();
                }}
                className="bg-blue-600 text-white rounded px-4 py-2"
              >
                Add Admin
              </button>
            </div>

            <DataTable
              headers={['TG ID', 'Name', 'Role', 'Actions']}
              rows={admins.map((a) => [
                a.tg_id,
                a.name,
                a.role,
                <button
                  key={a.id}
                  onClick={async () => {
                    if (confirm('Delete admin?')) {
                      await apiFetch(`/api/admins/${a.id}`, { method: 'DELETE' });
                      loadTab();
                    }
                  }}
                  className="text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>,
              ])}
            />
          </div>
        )}

        {activeTab === 'logs' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
              <span className="text-sm text-gray-500">Всего: {logsMeta.total}</span>
            </div>

            <div className="bg-white rounded-lg shadow p-4 mb-4 flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  value={logsSearch}
                  onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1); }}
                  placeholder="Поиск по действию, admin ID, деталям..."
                  className="border rounded pl-9 pr-3 py-2 text-sm w-full"
                />
              </div>
              {logsSearch && (
                <button
                  onClick={() => { setLogsSearch(''); setLogsPage(1); }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2 border rounded"
                >
                  Сбросить
                </button>
              )}
            </div>

            <DataTable
              headers={['Время', 'Admin TG ID', 'Действие', 'Детали']}
              rows={logs.map((l) => [
                new Date(l.created_at).toLocaleString(),
                l.admin_tg_id,
                <span key={l.id} className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  l.action.startsWith('DELETE') ? 'bg-red-100 text-red-700' :
                  l.action.startsWith('CREATE') || l.action.startsWith('ADD') ? 'bg-green-100 text-green-700' :
                  l.action.startsWith('UPDATE') ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{l.action}</span>,
                <pre key={`d-${l.id}`} className="text-xs whitespace-pre-wrap max-w-xs overflow-auto text-gray-600">
                  {JSON.stringify(l.details, null, 2)}
                </pre>,
              ])}
            />

            {logsMeta.pages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setLogsPage(1)}
                  disabled={logsPage === 1}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50"
                >«</button>
                <button
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  disabled={logsPage === 1}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50"
                >‹</button>
                {Array.from({ length: Math.min(7, logsMeta.pages) }, (_, i) => {
                  const half = 3;
                  let start = Math.max(1, logsPage - half);
                  const end = Math.min(logsMeta.pages, start + 6);
                  start = Math.max(1, end - 6);
                  const p = start + i;
                  if (p > logsMeta.pages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setLogsPage(p)}
                      className={`px-3 py-1 rounded border text-sm ${logsPage === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'}`}
                    >{p}</button>
                  );
                })}
                <button
                  onClick={() => setLogsPage((p) => Math.min(logsMeta.pages, p + 1))}
                  disabled={logsPage === logsMeta.pages}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50"
                >›</button>
                <button
                  onClick={() => setLogsPage(logsMeta.pages)}
                  disabled={logsPage === logsMeta.pages}
                  className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50"
                >»</button>
                <span className="text-sm text-gray-500 ml-2">стр. {logsPage} / {logsMeta.pages}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'msg-settings' && canAccess(user, 'manage_rules') && (
          <MsgSettingsTab
            msgSettings={msgSettings}
            allMsgFields={allMsgFields}
            onSave={async (settings) => {
              await apiFetch('/api/message-settings', { method: 'PUT', body: JSON.stringify({ settings }) });
              setMsgSettings(settings);
            }}
          />
        )}
      </div>
    </div>
  );
}

const FIELD_META: Record<string, { label: string; description: string }> = {
  type:        { label: 'Тип конверсии',  description: '☑️REG / ✅FTD / ✅🔄DEP / 💸WTD' },
  trader_id:   { label: 'Trader ID',      description: 'Идентификатор трейдера' },
  country:     { label: 'Страна (GEO)',   description: 'Гео трейдера' },
  sumdep:      { label: 'Сумма',          description: 'Сумма депозита / вывода' },
  tg_id:       { label: 'Telegram ID',    description: 'Числовой ID в Telegram' },
  tg_username: { label: 'TG Username',    description: 'Никнейм @username в Telegram' },
  wtd_status:  { label: 'Статус вывода',  description: 'pending / approved / declined' },
  partner:     { label: 'Партнёр',        description: 'Имя партнёрки (partner=)' },
  click_id:    { label: 'Click ID',       description: 'ID клика (click_id=)' },
};

const CONVERSION_TYPE_TABS = ['REG', 'FTD', 'DEP', 'WTD'] as const;
type ConvType = typeof CONVERSION_TYPE_TABS[number];

const FIELD_EXAMPLES: Record<string, string> = {
  type: '', // filled per tab
  trader_id:   '🆔12345',
  country:     '🌍UA',
  sumdep:      '💰250',
  tg_id:       '👤987654321',
  tg_username: '📎@trader_nick',
  wtd_status:  '🔖⏳ pending',
  partner:     '🤝MyAffiliate',
  click_id:    '🔗abc123',
};
const TYPE_PREVIEW: Record<string, string> = {
  REG: '☑️REG', FTD: '✅FTD', DEP: '✅🔄DEP', WTD: '💸WTD',
};

function buildPreview(fields: string[], convType: ConvType): string {
  return fields
    .map((f) => f === 'type' ? TYPE_PREVIEW[convType] : FIELD_EXAMPLES[f] ?? f)
    .filter(Boolean)
    .join(' ');
}

function MsgSettingsTab({
  msgSettings,
  allMsgFields,
  onSave,
}: {
  msgSettings: Record<string, string[]>;
  allMsgFields: string[];
  onSave: (settings: Record<string, string[]>) => Promise<void>;
}) {
  const fields = allMsgFields.length > 0 ? allMsgFields : Object.keys(FIELD_META);
  const [activeType, setActiveType] = useState<ConvType>('REG');
  const [localSettings, setLocalSettings] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocalSettings(msgSettings); setSaved(false); }, [msgSettings]);

  const currentFields = localSettings[activeType] ?? [];

  const toggle = (field: string) => {
    if (field === 'type') return;
    const cur = localSettings[activeType] ?? [];
    const next = cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field];
    setLocalSettings((prev) => ({ ...prev, [activeType]: next }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Preserve order from allFields
      const ordered: Record<string, string[]> = {};
      for (const t of CONVERSION_TYPE_TABS) {
        ordered[t] = fields.filter((f) => (localSettings[t] ?? []).includes(f));
      }
      await onSave(ordered);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const TAB_COLOR: Record<ConvType, string> = {
    REG: 'bg-slate-600', FTD: 'bg-green-600', DEP: 'bg-blue-600', WTD: 'bg-red-600',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Message Settings</h1>
      <p className="text-gray-500 mb-6 text-sm">Настрой какие поля включать в Telegram-сообщение для каждого типа конверсии.</p>

      {/* Type tabs */}
      <div className="flex gap-2 mb-6">
        {CONVERSION_TYPE_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-colors ${
              activeType === t
                ? `${TAB_COLOR[t]} text-white shadow`
                : 'bg-white text-gray-600 border hover:border-gray-400'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-4">
          Поля для&nbsp;
          <span className={`inline-block px-2 py-0.5 rounded text-sm text-white ${TAB_COLOR[activeType]}`}>{activeType}</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((field) => {
            const meta = FIELD_META[field] || { label: field, description: '' };
            const isChecked = currentFields.includes(field);
            const isLocked = field === 'type';
            // wtd_status only makes sense for WTD
            const isDimmed = field === 'wtd_status' && activeType !== 'WTD';
            return (
              <label
                key={field}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isChecked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                } ${isLocked || isDimmed ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={isLocked || isDimmed}
                  onChange={() => toggle(field)}
                  className="mt-0.5 h-4 w-4 text-blue-600 rounded"
                />
                <div>
                  <div className="font-medium text-sm text-gray-800">{meta.label}</div>
                  <div className="text-xs text-gray-500">{meta.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">
          Предпросмотр&nbsp;
          <span className={`inline-block px-2 py-0.5 rounded text-sm text-white ${TAB_COLOR[activeType]}`}>{activeType}</span>
        </h3>
        <div className="bg-gray-900 text-green-400 rounded-lg p-4 font-mono text-sm break-all min-h-[48px]">
          {currentFields.length > 0
            ? buildPreview(currentFields, activeType)
            : <span className="text-gray-500">Выбери хотя бы одно поле</span>}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Сохраняем...' : saved ? '✓ Сохранено' : 'Сохранить все настройки'}
      </button>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center p-3 rounded-lg transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'
      }`}
    >
      {icon}
      <span className="ml-3 font-medium">{label}</span>
    </button>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number | ReactNode)[][] }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
