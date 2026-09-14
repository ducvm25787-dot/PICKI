export type PickiConfig = {
  databaseUrl: string;
  sessionSecret: string;
  apiPort: number;
  nodeEnv: string;
  otpDevExpose: boolean;
  sessionTtlDays: number;
  otpTtlMinutes: number;
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
    otpDevExpose:
      process.env.AUTH_OTP_DEV_EXPOSE === "true" ||
      (process.env.NODE_ENV ?? "development") === "development",
    sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
    otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES ?? 5),
  };
}
