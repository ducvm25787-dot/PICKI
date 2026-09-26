/** Vietnam has no DST. Experience filters use this offset, not the server locale. */
const ICT_OFFSET_MS = 7 * 60 * 60 * 1000;

export type WhenFilter = "today" | "weekend" | "next_week" | "upcoming";

export type HomeWindowId = "weekend" | "today_through_sunday" | "next_week";

export type IctParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
};

export function ictParts(instant: Date): IctParts {
  const shifted = new Date(instant.getTime() + ICT_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
  };
}

export function ictDayStart(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - ICT_OFFSET_MS);
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Monday 00:00 ICT of the week that contains `instant`. */
export function ictWeekMonday(instant: Date): Date {
  const parts = ictParts(instant);
  const start = ictDayStart(parts.year, parts.month, parts.day);
  const fromMonday = parts.weekday === 0 ? 6 : parts.weekday - 1;
  return addDays(start, -fromMonday);
}

export type TimeWindow = { start: Date; end: Date | null };

export function filterWindow(when: WhenFilter, now: Date): TimeWindow {
  const parts = ictParts(now);
  const today = ictDayStart(parts.year, parts.month, parts.day);
  if (when === "today") return { start: today, end: addDays(today, 1) };
  if (when === "upcoming") return { start: now, end: null };
  const monday = ictWeekMonday(now);
  if (when === "weekend") return { start: addDays(monday, 5), end: addDays(monday, 7) };
  return { start: addDays(monday, 7), end: addDays(monday, 14) };
}

export function occurrenceInWindow(startAt: Date, window: TimeWindow, now: Date): boolean {
  if (window.end == null) return startAt.getTime() >= now.getTime();
  return startAt.getTime() >= window.start.getTime() && startAt.getTime() < window.end.getTime();
}

export type HomeContext = {
  copy: string;
  when: "weekend" | "next_week";
  window: TimeWindow;
  windowId: HomeWindowId;
};

/** Copy changes through the week. Content is whatever is published inside the window. */
export function homeContext(now: Date): HomeContext {
  const parts = ictParts(now);
  const monday = ictWeekMonday(now);
  const weekend: TimeWindow = { start: addDays(monday, 5), end: addDays(monday, 7) };
  const nextWeek: TimeWindow = { start: addDays(monday, 7), end: addDays(monday, 14) };
  const today = ictDayStart(parts.year, parts.month, parts.day);

  if (parts.weekday === 0 && parts.hour >= 17) {
    return {
      copy: "Tuần tới có gì?",
      when: "next_week",
      window: nextWeek,
      windowId: "next_week",
    };
  }
  if (parts.weekday === 6 || parts.weekday === 0) {
    return {
      copy: "Hôm nay & cuối tuần",
      when: "weekend",
      window: { start: today, end: weekend.end },
      windowId: "today_through_sunday",
    };
  }
  if (parts.weekday >= 4) {
    return {
      copy: "Cuối tuần này",
      when: "weekend",
      window: weekend,
      windowId: "weekend",
    };
  }
  return {
    copy: "Cuối tuần này đi đâu?",
    when: "weekend",
    window: weekend,
    windowId: "weekend",
  };
}

export function formatIctShort(instant: Date): string {
  const parts = ictParts(instant);
  const shifted = new Date(instant.getTime() + ICT_OFFSET_MS);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")} ${hh}:${mm}`;
}
