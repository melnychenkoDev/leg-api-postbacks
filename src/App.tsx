import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TelegramLoginWidget } from './components/TelegramLoginWidget';
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
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);

  const [leadFilters, setLeadFilters] = useState<Record<string, string>>({
    date_from: '',
    date_to: '',
    country: '',
    tg_id: '',
    trader_id: '',
    click_id: '',
    partner: '',
    type: '',
  });

  const [newRule, setNewRule] = useState({ partner: 'default', conversion_type: '*', target_chat_id: '' });
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
        setRules(await apiFetch('/api/rules'));
      } else if (activeTab === 'admins' && canAccess(user, 'manage_admins')) {
        setAdmins(await apiFetch('/api/admins'));
      } else if (activeTab === 'tokens' && canAccess(user, 'manage_tokens')) {
        setApiTokens(await apiFetch('/api/tokens'));
      } else if (activeTab === 'analytics' && canAccess(user, 'manage_analytics')) {
        setAnalytics(await apiFetch('/api/analytics'));
      } else if (activeTab === 'logs' && canAccess(user, 'view_logs')) {
        setLogs(await apiFetch('/api/logs'));
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [activeTab, token, user, apiFetch, loadLeads]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const handleAuth = async (tgUser: any) => {
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tgUser),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
      } else {
        alert('Auth failed: ' + (data.error || 'Unknown'));
      }
    } catch {
      alert('Error during auth');
    }
  };

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
          <TelegramLoginWidget onAuth={handleAuth} />

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
              headers={['Date', 'Type', 'Deposit', 'Country', 'Trader ID', 'Partner', 'TG ID', 'Click ID']}
              rows={leads.map((lead) => [
                new Date(lead.created_at).toLocaleString(),
                lead.type,
                lead.sumdep || 0,
                lead.country,
                lead.trader_id,
                lead.partner,
                lead.tg_id,
                lead.click_id,
              ])}
            />
          </div>
        )}

        {activeTab === 'rules' && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Routing Rules</h1>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="font-medium mb-4">Add Rule</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  placeholder="Partner (default)"
                  value={newRule.partner}
                  onChange={(e) => setNewRule({ ...newRule, partner: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <select
                  value={newRule.conversion_type}
                  onChange={(e) => setNewRule({ ...newRule, conversion_type: e.target.value })}
                  className="border rounded px-3 py-2"
                >
                  {CONVERSION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Telegram chat_id (-100...)"
                  value={newRule.target_chat_id}
                  onChange={(e) => setNewRule({ ...newRule, target_chat_id: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <button
                  onClick={async () => {
                    await apiFetch('/api/rules', { method: 'POST', body: JSON.stringify(newRule) });
                    setNewRule({ partner: 'default', conversion_type: '*', target_chat_id: '' });
                    loadTab();
                  }}
                  className="bg-blue-600 text-white rounded px-4 py-2 flex items-center justify-center"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {rules.map((r) => (
                <div key={r.id} className="bg-white rounded-lg shadow p-4 flex justify-between items-center">
                  <div>
                    <span className="font-bold">{r.partner}</span> → [{r.conversion_type}] →{' '}
                    <span className="text-blue-600">{r.target_chat_id}</span>
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
              ))}
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
            <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit Logs</h1>
            <DataTable
              headers={['Time', 'Admin', 'Action', 'Details']}
              rows={logs.map((l) => [
                new Date(l.created_at).toLocaleString(),
                l.admin_tg_id,
                l.action,
                <pre key={l.id} className="text-xs whitespace-pre-wrap">
                  {JSON.stringify(l.details)}
                </pre>,
              ])}
            />
          </div>
        )}
      </div>
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
