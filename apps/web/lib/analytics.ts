import { api } from "./api";

/** Client-side Habit-First analytics — fire-and-forget, never blocks UI. */
export function track(
  name: string,
  opts?: {
    zoneId?: string;
    properties?: Record<string, unknown>;
  },
): void {
  if (typeof window === "undefined") return;
  void api("/analytics/events", {
    method: "POST",
    body: JSON.stringify({
      events: [
        {
          name,
          zoneId: opts?.zoneId,
          properties: opts?.properties,
        },
      ],
    }),
  }).catch(() => undefined);
}

export function trackMany(
  events: { name: string; zoneId?: string; properties?: Record<string, unknown> }[],
): void {
  if (typeof window === "undefined" || events.length === 0) return;
  void api("/analytics/events", {
    method: "POST",
    body: JSON.stringify({ events: events.slice(0, 20) }),
  }).catch(() => undefined);
}
