export const USER_ROLES = {
  TV: 'tv',
  OPERATOR: 'operator',
  SUPERVISOR: 'supervisor',
  MANAGER: 'manager',
  ADMIN: 'admin',
};

export const PERMISSIONS = {
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_TV_PANEL: 'view_tv_panel',
  VIEW_REPORTS: 'view_reports',
  REGISTER_PRODUCTION: 'register_production',
  MAKE_APONTAMENTOS: 'make_apontamentos',
  REPORT_STOPS: 'report_stops',
  APPROVE_OPERATIONAL: 'approve_operational',
  MANAGE_OPERATIONAL: 'manage_operational',
  CREATE_ORDER: 'create_order',
  EDIT_ORDER: 'edit_order',
  REORDER_QUEUE: 'reorder_queue',
  VIEW_RASTREIO: 'view_rastreio',
  ACCESS_GESTAO: 'access_gestao',
  MANAGE_MACHINES: 'manage_machines',
  MANAGE_USERS: 'manage_users',
  MANAGE_COMPANY_SETTINGS: 'manage_company_settings',
  MANAGE_PERMISSIONS: 'manage_permissions',
  MANAGE_CATALOG: 'manage_catalog',
};

const ROLE_ALIASES = {
  fabrica: USER_ROLES.OPERATOR,
  pcp: USER_ROLES.SUPERVISOR,
  gestao: USER_ROLES.MANAGER,
  viewer: USER_ROLES.TV,
};

const ROLE_PERMISSION_LIST = {
  [USER_ROLES.TV]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_TV_PANEL,
  ],
  [USER_ROLES.OPERATOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_TV_PANEL,
    PERMISSIONS.REGISTER_PRODUCTION,
    PERMISSIONS.MAKE_APONTAMENTOS,
    PERMISSIONS.REPORT_STOPS,
  ],
  [USER_ROLES.SUPERVISOR]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_TV_PANEL,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.REGISTER_PRODUCTION,
    PERMISSIONS.MAKE_APONTAMENTOS,
    PERMISSIONS.REPORT_STOPS,
    PERMISSIONS.APPROVE_OPERATIONAL,
    PERMISSIONS.VIEW_RASTREIO,
  ],
  [USER_ROLES.MANAGER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_TV_PANEL,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.REGISTER_PRODUCTION,
    PERMISSIONS.MAKE_APONTAMENTOS,
    PERMISSIONS.REPORT_STOPS,
    PERMISSIONS.APPROVE_OPERATIONAL,
    PERMISSIONS.MANAGE_OPERATIONAL,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.EDIT_ORDER,
    PERMISSIONS.REORDER_QUEUE,
    PERMISSIONS.VIEW_RASTREIO,
    PERMISSIONS.ACCESS_GESTAO,
    PERMISSIONS.MANAGE_MACHINES,
  ],
  [USER_ROLES.ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.VIEW_TV_PANEL,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.REGISTER_PRODUCTION,
    PERMISSIONS.MAKE_APONTAMENTOS,
    PERMISSIONS.REPORT_STOPS,
    PERMISSIONS.APPROVE_OPERATIONAL,
    PERMISSIONS.MANAGE_OPERATIONAL,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.EDIT_ORDER,
    PERMISSIONS.REORDER_QUEUE,
    PERMISSIONS.VIEW_RASTREIO,
    PERMISSIONS.ACCESS_GESTAO,
    PERMISSIONS.MANAGE_MACHINES,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_COMPANY_SETTINGS,
    PERMISSIONS.MANAGE_PERMISSIONS,
    PERMISSIONS.MANAGE_CATALOG,
  ],
};

export function normalizeUserRole(inputRole) {
  const raw = String(inputRole || '').trim().toLowerCase();
  if (!raw) return null;
  if (ROLE_PERMISSION_LIST[raw]) return raw;
  return ROLE_ALIASES[raw] || null;
}

export function permissionSetForRole(inputRole) {
  const role = normalizeUserRole(inputRole);
  const list = role ? ROLE_PERMISSION_LIST[role] || [] : [];
  return new Set(list);
}

export function hasPermissionForRole(inputRole, permission) {
  return permissionSetForRole(inputRole).has(permission);
}

export function canAccessPath(pathname, permissions) {
  const path = String(pathname || '').toLowerCase();
  if (path === '/login') return true;
  if (path === '/tv') return permissions.has(PERMISSIONS.VIEW_TV_PANEL);
  if (path === '/prioridade') return permissions.has(PERMISSIONS.MANAGE_OPERATIONAL);
  if (path === '/ficha') return permissions.has(PERMISSIONS.VIEW_REPORTS);
  if (path === '/indicadores') return permissions.has(PERMISSIONS.ACCESS_GESTAO);
  return true;
}
