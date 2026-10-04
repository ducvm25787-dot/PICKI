/** Legacy — customer session; kept for backward compatibility reads */
export const SESSION_COOKIE_NAME = "picki_session";

export const SESSION_COOKIE_NAMES = {
  customer: "picki_session",
  provider: "picki_provider_session",
  runner: "picki_runner_session",
  admin: "picki_admin_session",
} as const;

export type PickiAppRole = keyof typeof SESSION_COOKIE_NAMES;

export function isPickiAppRole(value: string): value is PickiAppRole {
  return value in SESSION_COOKIE_NAMES;
}

/** Resolve session cookie from API path (e2e / direct API). */
export function sessionCookieForApiPath(path: string): string {
  if (path.startsWith("/v1/provider") || path.startsWith("/provider")) {
    return SESSION_COOKIE_NAMES.provider;
  }
  if (path.startsWith("/v1/runner") || path.startsWith("/runner")) {
    return SESSION_COOKIE_NAMES.runner;
  }
  if (path.startsWith("/v1/admin") || path.startsWith("/admin")) {
    return SESSION_COOKIE_NAMES.admin;
  }
  return SESSION_COOKIE_NAMES.customer;
}

/** Web client: map browser path → app role for X-Picki-App header. */
export function pickiAppFromBrowserPath(pathname: string): PickiAppRole {
  if (pathname.startsWith("/provider")) return "provider";
  if (pathname.startsWith("/runner")) return "runner";
  if (pathname.startsWith("/admin")) return "admin";
  return "customer";
}

const ADMIN_SESSION_ROLES = new Set(["ZONE_ADMIN", "SUPER_ADMIN", "SUPPORT"]);
const PROVIDER_SESSION_ROLES = new Set([
  "PROVIDER_OWNER",
  "PROVIDER_MANAGER",
  "PROVIDER_STAFF",
]);

/** Apps this user can actually operate. Customer is the fallback, not a staff door. */
export function staffAppsForRoles(roles: readonly string[]): PickiAppRole[] {
  const apps: PickiAppRole[] = [];
  if (roles.some((role) => ADMIN_SESSION_ROLES.has(role))) apps.push("admin");
  if (roles.some((role) => PROVIDER_SESSION_ROLES.has(role))) apps.push("provider");
  if (roles.includes("RUNNER")) apps.push("runner");
  return apps;
}

/**
 * A staff phone that signs in on the customer door still lands in its own app.
 * An explicit door is kept when the account has that role.
 */
export function resolveSessionApp(
  requested: PickiAppRole | undefined,
  roles: readonly string[],
): PickiAppRole {
  const ask = requested ?? "customer";
  const staff = staffAppsForRoles(roles);
  if (staff.includes(ask)) return ask;
  if (staff.length === 1) return staff[0] ?? "customer";
  return "customer";
}

export function homePathForApp(app: PickiAppRole): string {
  if (app === "provider") return "/provider";
  if (app === "runner") return "/runner";
  if (app === "admin") return "/admin";
  return "/";
}

export type AuthUserDto = {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  activeZoneId: string | null;
  roles: string[];
  identities: { provider: string; externalUserId: string }[];
  /** True only after a stored declaration whose date of birth is at least 18. */
  draftBeerAllowed: boolean;
};
