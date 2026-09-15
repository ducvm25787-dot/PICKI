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

export type AuthUserDto = {
  id: string;
  displayName: string | null;
  activeZoneId: string | null;
  roles: string[];
  identities: { provider: string; externalUserId: string }[];
};
