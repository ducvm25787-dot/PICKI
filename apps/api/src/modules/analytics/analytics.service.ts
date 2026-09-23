import { Inject, Injectable } from "@nestjs/common";
import { countAnalyticsByName, insertAnalyticsEvents, type PickiSql } from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_SQL } from "../../shared/tokens.js";

const ALLOWED = new Set([
  "home_section_impression",
  "familiar_provider_impression",
  "familiar_provider_click",
  "today_offer_impression",
  "today_offer_click",
  "repeat_action_click",
  "search_query",
  "search_result_click",
  "search_zero_result",
  "favorite_add",
  "favorite_remove",
  "loyalty_benefit_used",
  "provider_contact",
]);

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PICKI_SQL) private readonly sql: PickiSql) {}

  async track(
    userId: string | null | undefined,
    events: {
      name: string;
      zoneId?: string;
      properties?: Record<string, unknown>;
    }[],
  ) {
    if (!events.length) return { accepted: 0 };
    if (events.length > 20) {
      throw new PickiError("VALIDATION_ERROR", "Max 20 events per request");
    }

    const rows = events
      .map((e) => {
        const name = e.name.trim();
        if (!ALLOWED.has(name)) return null;
        return {
          eventName: name,
          userId: userId ?? null,
          zoneId: e.zoneId ?? null,
          properties: e.properties ?? {},
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);

    const accepted = await insertAnalyticsEvents(this.sql, rows);
    return { accepted };
  }

  /** Best-effort; never throws to callers. */
  trackFireAndForget(
    userId: string | null | undefined,
    name: string,
    opts?: { zoneId?: string; properties?: Record<string, unknown> },
  ) {
    if (!ALLOWED.has(name)) return;
    void insertAnalyticsEvents(this.sql, [
      {
        eventName: name,
        userId: userId ?? null,
        zoneId: opts?.zoneId ?? null,
        properties: opts?.properties ?? {},
      },
    ]).catch(() => undefined);
  }

  async summary(days = 7) {
    const rows = await countAnalyticsByName(this.sql, days);
    return {
      days,
      counts: rows.map((r) => ({ eventName: r.event_name, count: Number(r.cnt) })),
    };
  }
}
