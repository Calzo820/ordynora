export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  kitchen: "Cucina",
  bar: "Bar",
  cashier: "Cassa",
  waiter: "Sala",
  superadmin: "SuperAdmin",
};

export const ROLE_HOME = {
  owner: "/dashboard",
  admin: "/dashboard",
  kitchen: "/cucina",
  bar: "/bar",
  cashier: "/cassa",
  waiter: "/tavoli",
  superadmin: "/super-admin",
};

export const ROLE_PERMISSIONS = {
  owner: ["dashboard", "menu", "tables", "kitchen", "bar", "cashier", "reports", "billing", "staff", "settings", "qr"],
  admin: ["dashboard", "menu", "tables", "kitchen", "bar", "cashier", "reports", "billing", "staff", "settings", "qr"],
  kitchen: ["kitchen"],
  bar: ["bar"],
  cashier: ["cashier", "tables"],
  waiter: ["tables"],
  superadmin: ["superadmin"],
};

const ROLE_ALIASES = {
  owner: "owner",
  proprietario: "owner",
  titolare: "owner",
  admin: "admin",
  administrator: "admin",
  amministratore: "admin",
  cucina: "kitchen",
  kitchen: "kitchen",
  chef: "kitchen",
  cuoco: "kitchen",
  bar: "bar",
  bartender: "bar",
  barman: "bar",
  cassa: "cashier",
  cassiere: "cashier",
  cashier: "cashier",
  sala: "waiter",
  waiter: "waiter",
  cameriere: "waiter",
  staff: "waiter",
  superadmin: "superadmin",
  super_admin: "superadmin",
  platform: "superadmin",
};

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[normalized] || normalized;
}

export function isAdminRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "owner" || normalized === "admin";
}

export function isOperationalRole(role) {
  return ["kitchen", "bar", "cashier", "waiter"].includes(normalizeRole(role));
}

export function isSuperAdminUser(user) {
  const role = normalizeRole(user?.role);
  return Boolean(user?.isSuperAdmin) || role === "superadmin";
}

export function getRoleLabel(role) {
  return ROLE_LABELS[normalizeRole(role)] || "Staff";
}

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

export function hasPermission(role, permission) {
  return getRolePermissions(role).includes(permission);
}

export function getHomePathByRole(role, user = null) {
  if (isSuperAdminUser(user) || normalizeRole(role) === "superadmin") return ROLE_HOME.superadmin;
  return ROLE_HOME[normalizeRole(role)] || "/dashboard";
}

export function canAccessRole(allowedRoles = [], user = null) {
  const normalizedAllowed = allowedRoles.map(normalizeRole).filter(Boolean);
  if (!normalizedAllowed.length) return true;

  const userRole = normalizeRole(user?.role);
  if (isSuperAdminUser(user)) return normalizedAllowed.includes("superadmin");
  if (isAdminRole(userRole) && normalizedAllowed.includes("admin")) return true;
  return normalizedAllowed.includes(userRole);
}
