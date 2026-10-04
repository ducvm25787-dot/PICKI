/** Sáng mai giao. Cutoff and prepare lead always come from location config. */

export const MARKET_MORNING_PURPOSE = "MARKET_MORNING" as const;

export type MarketMorningPurpose = typeof MARKET_MORNING_PURPOSE;

const ZONE = "Asia/Ho_Chi_Minh";

export function zonedISODate(now: Date, timeZone = ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! + days));
  return utc.toISOString().slice(0, 10);
}

export function tomorrowDate(now: Date, timeZone = ZONE): string {
  return addCalendarDays(zonedISODate(now, timeZone), 1);
}

export function zonedClock(now: Date, timeZone = ZONE): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return { hour, minute };
}

export function parseClock(value: string): number {
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Wall clock in `timeZone` → UTC instant. */
export function wallClockToUtc(isoDate: string, hhmm: string, timeZone = ZONE): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  const [hour, minute] = hhmm.slice(0, 5).split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!, 0));
  const seenDate = zonedISODate(utcGuess, timeZone);
  const seenClock = zonedClock(utcGuess, timeZone);
  const [sy, sm, sd] = seenDate.split("-").map(Number);
  const seenUtc = Date.UTC(sy!, sm! - 1, sd!, seenClock.hour, seenClock.minute);
  const intended = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  return new Date(utcGuess.getTime() - (seenUtc - intended));
}

/**
 * Orders are accepted only on the calendar day before `serviceDate`,
 * and only before the location cutoff.
 */
export function morningOrderingOpen(input: {
  now: Date;
  serviceDate: string;
  cutoffTime: string;
  timeZone?: string;
}): boolean {
  const timeZone = input.timeZone ?? ZONE;
  const today = zonedISODate(input.now, timeZone);
  const eve = addCalendarDays(input.serviceDate, -1);
  if (today !== eve) return false;
  const clock = zonedClock(input.now, timeZone);
  return clock.hour * 60 + clock.minute < parseClock(input.cutoffTime);
}

/** READY / find-runner / runner pickup open at slot start minus the location lead. */
export function morningPrepareOpen(input: {
  now: Date;
  serviceDate: string;
  startsAt: string;
  prepareLeadMinutes: number;
  timeZone?: string;
}): boolean {
  const timeZone = input.timeZone ?? ZONE;
  const start = wallClockToUtc(input.serviceDate, input.startsAt, timeZone);
  const openAt = start.getTime() - input.prepareLeadMinutes * 60_000;
  return input.now.getTime() >= openAt;
}
