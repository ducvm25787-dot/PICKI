export const SESSION_COOKIE_NAME = "picki_session";

export type AuthUserDto = {
  id: string;
  displayName: string | null;
  activeZoneId: string | null;
  roles: string[];
  identities: { provider: string; externalUserId: string }[];
};
