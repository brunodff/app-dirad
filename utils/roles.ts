// app/utils/roles.ts
export type Role =
  | "USER"
  | "CHEFE"
  | "SECRETARIA"
  | "DIRAD"
  | "SDAB"
  | "SDPP"
  | "SDAP"
  | "EMPENHOS"
  | "GESTOR";

export const is = {
  user: (r?: string | null) => r === "USER",
  chefe: (r?: string | null) => r === "CHEFE",
  secretaria: (r?: string | null) => r === "SECRETARIA",
  dirad: (r?: string | null) => r === "DIRAD",
  sdab: (r?: string | null) => r === "SDAB",
  sdpp: (r?: string | null) => r === "SDPP",
  sdap: (r?: string | null) => r === "SDAP",
  empenhos: (r?: string | null) => r === "EMPENHOS",
  gestor: (r?: string | null) => r === "GESTOR",
};

// Home por role
export const roleHome: Record<Role, string> = {
  USER: "/user",
  CHEFE: "/chefe",
  SECRETARIA: "/secretaria",
  DIRAD: "/dirad",
  SDAB: "/sdab",
  SDPP: "/sdpp",
  SDAP: "/sdap",
  EMPENHOS: "/empenhos",
  GESTOR: "/empenhos",
};

export function resolveHomePath(role?: string | null) {
  const r = (role ?? "USER").toUpperCase() as Role;
  return roleHome[r] ?? "/user";
}
