/** Late-night selling window helpers (overnight-safe). */

export function parseHmToMinutes(hhMm: string): number {
  const [h, m] = hhMm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatHmFromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * True if now (HH:MM) is inside [startsAt, endsAt).
 * If endsAt <= startsAt, window spans midnight (e.g. 20:30 → 02:00).
 */
export function isWithinLateNightWindow(
  nowHhMm: string,
  startsAt: string,
  endsAt: string,
): boolean {
  const now = parseHmToMinutes(nowHhMm);
  const start = parseHmToMinutes(startsAt);
  const end = parseHmToMinutes(endsAt);
  if (end === start) return true; // 24h
  if (end > start) return now >= start && now < end;
  return now >= start || now < end;
}

export function vnNowHhMm(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

export function isLateNightDiscoveryHour(now = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "numeric",
      hour12: false,
    })
      .formatToParts(now)
      .find((p) => p.type === "hour")?.value ?? "12",
  );
  return hour >= 20 || hour < 5;
}
