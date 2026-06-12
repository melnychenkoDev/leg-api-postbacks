export type Role = 'superadmin' | 'admin' | 'viewer';

export type Permission =
  | 'view_leads'
  | 'export_leads'
  | 'manage_rules'
  | 'manage_admins'
  | 'manage_tokens'
  | 'view_logs'
  | 'manage_analytics';

export const ALL_PERMISSIONS: Permission[] = [
  'view_leads',
  'export_leads',
  'manage_rules',
  'manage_admins',
  'manage_tokens',
  'view_logs',
  'manage_analytics',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: ALL_PERMISSIONS,
  admin: ['view_leads', 'export_leads', 'manage_rules'],
  viewer: ['view_leads'],
};

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  permissions?: Permission[];
}

export function getUserPermissions(user: AuthUser): Permission[] {
  if (user.permissions?.length) return user.permissions;
  return ROLE_PERMISSIONS[user.role] || [];
}

export function hasPermission(user: AuthUser, permission: Permission): boolean {
  if (user.role === 'superadmin') return true;
  return getUserPermissions(user).includes(permission);
}
