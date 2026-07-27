export const appModules = [
  "ganadero",
  "agricola",
  "maquinarias",
  "rrhh",
  "financiero",
  "deposito",
  "cierres",
  "usuarios",
] as const;
export const appRoles = ["lector", "editor", "administrador", "desarrollador"] as const;
export const permissionRoles = [
  "sin_acceso",
  "lector",
  "editor",
  "administrador",
  "desarrollador",
] as const;

export type AppModule = (typeof appModules)[number];
export type AppRole = (typeof appRoles)[number];
export type PermissionRole = (typeof permissionRoles)[number];

export type AppUser = {
  active: boolean;
  email: string;
  fullName: string;
  id: string;
  permissions: Record<AppModule, PermissionRole>;
  role: AppRole;
};

const roleWeight: Record<PermissionRole, number> = {
  sin_acceso: 0,
  lector: 1,
  editor: 2,
  administrador: 3,
  desarrollador: 4,
};

export function hasPermission(
  user: AppUser | undefined,
  moduleName: AppModule,
  minimumRole: PermissionRole,
) {
  if (!user?.active) return false;
  if (user.role === "desarrollador") return true;
  return roleWeight[user.permissions[moduleName] ?? "sin_acceso"] >= roleWeight[minimumRole];
}

export function canReadModule(user: AppUser | undefined, moduleName: AppModule) {
  return hasPermission(user, moduleName, "lector");
}

export function canEditModule(user: AppUser | undefined, moduleName: AppModule) {
  return hasPermission(user, moduleName, "editor");
}
