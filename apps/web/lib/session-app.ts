/** Where a signed-in phone should land. Matches API `app` from OTP verify. */
export function homePathForApp(app: string | undefined, fallback: string): string {
  if (app === "provider") return "/provider";
  if (app === "runner") return "/runner";
  if (app === "admin") return "/admin";
  if (app === "customer") return "/";
  return fallback;
}
