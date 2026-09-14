import { createHash, randomBytes, randomInt } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashOtp(code: string, destination: string, secret: string): string {
  return sha256(`${code}:${destination}:${secret}`);
}

export function generateOtpCode(): string {
  return String(randomInt(100000, 999999));
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  if (trimmed.startsWith("0")) return `+84${trimmed.slice(1)}`;
  return trimmed;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
