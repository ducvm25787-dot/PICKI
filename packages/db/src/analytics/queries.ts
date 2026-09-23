import type postgres from "postgres";

export type AnalyticsEventInput = {
  eventName: string;
  userId?: string | null;
  zoneId?: string | null;
  properties?: Record<string, unknown>;
};

/** Fire-and-forget friendly insert; caller should not await critically. */
export async function insertAnalyticsEvents(
  sql: postgres.Sql,
  events: AnalyticsEventInput[],
): Promise<number> {
  if (events.length === 0) return 0;
  let n = 0;
  for (const e of events) {
    const name = e.eventName.trim().slice(0, 80);
    if (!name) continue;
    await sql`
      INSERT INTO analytics_events (event_name, user_id, zone_id, properties)
      VALUES (
        ${name},
        ${e.userId ?? null}::uuid,
        ${e.zoneId ?? null}::uuid,
        ${JSON.stringify(e.properties ?? {})}::jsonb
      )
    `;
    n += 1;
  }
  return n;
}

export type AnalyticsCountRow = {
  event_name: string;
  cnt: string;
};

/** Basic dash: counts by event name for last N days. */
export async function countAnalyticsByName(
  sql: postgres.Sql,
  days = 7,
): Promise<AnalyticsCountRow[]> {
  const safeDays = Math.min(Math.max(days, 1), 90);
  return sql<AnalyticsCountRow[]>`
    SELECT event_name, count(*)::text AS cnt
    FROM analytics_events
    WHERE created_at >= now() - (${safeDays}::text || ' days')::interval
    GROUP BY event_name
    ORDER BY count(*) DESC
    LIMIT 50
  `;
}
