export type PickiConfig = {
  databaseUrl: string;
  sessionSecret: string;
  apiPort: number;
  nodeEnv: string;
  webOrigin: string;
  otpDevExpose: boolean;
  sessionTtlDays: number;
  otpTtlMinutes: number;
  payosClientId: string | null;
  payosApiKey: string | null;
  payosChecksumKey: string | null;
  vapidPublicKey: string | null;
  vapidPrivateKey: string | null;
  vapidSubject: string | null;
};

export function loadConfig(): PickiConfig {
  const databaseUrl = process.env.DATABASE_URL;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  if (!sessionSecret || sessionSecret.length < 16) {
    throw new Error("SESSION_SECRET must be at least 16 characters");
  }

  return {
    databaseUrl,
    sessionSecret,
    apiPort: Number(process.env.API_PORT ?? 3000),
    nodeEnv: process.env.NODE_ENV ?? "development",
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:3001",
    otpDevExpose:
      process.env.AUTH_OTP_DEV_EXPOSE === "true" ||
      (process.env.NODE_ENV ?? "development") === "development",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
    otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
    payosClientId: process.env.PAYOS_CLIENT_ID ?? null,
    payosApiKey: process.env.PAYOS_API_KEY ?? null,
    payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY ?? null,
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? null,
    vapidSubject: process.env.VAPID_SUBJECT ?? null,
  };
}
