import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  isWithinLateNightWindow,
  lateNightProviderSettings,
  listLateNightProvidersEnabled,
  providerLocations,
  providerMembers,
  vnNowHhMm,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import type { z } from "zod";
import type { patchLateNightSettingsSchema } from "./dto.js";

function formatTime(value: string | unknown): string {
  if (typeof value !== "string") return "20:30";
  return value.slice(0, 5);
}

@Injectable()
export class LateNightService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
  ) {}

  async listForZone(zoneId: string) {
    const nowHm = vnNowHhMm();
    const rows = await listLateNightProvidersEnabled(this.sql, zoneId);
    const providersOut = rows
      .filter((r) => isWithinLateNightWindow(nowHm, r.late_starts_at, r.late_ends_at))
      .map((r) => ({
        locationId: r.location_id,
        providerId: r.provider_id,
        brandName: r.brand_name,
        displayName: r.display_name,
        providerType: r.provider_type,
        tagline: r.tagline,
        liveStatus: r.live_status,
        prepMinutes: r.prep_minutes,
        etaMinutes: r.eta_minutes,
        addressLine: r.address_line,
        sampleOffering: r.sample_offering,
        lateNightUntil: r.late_ends_at,
        lateNightFrom: r.late_starts_at,
        logoUrl: r.logo_url ?? null,
      }));

    return {
      nowHhMm: nowHm,
      providers: providersOut,
    };
  }

  async getSettings(userId: string, locationId: string) {
    await this.assertProviderStaff(userId, locationId);
    const row = await this.db
      .select()
      .from(lateNightProviderSettings)
      .where(eq(lateNightProviderSettings.providerLocationId, locationId))
      .limit(1);
    const s = row[0];
    return {
      enabled: s?.enabled ?? false,
      startsAt: formatTime(s?.startsAt ?? "20:30"),
      endsAt: formatTime(s?.endsAt ?? "02:00"),
      acceptingNow: s?.enabled
        ? isWithinLateNightWindow(
            vnNowHhMm(),
            formatTime(s.startsAt),
            formatTime(s.endsAt),
          )
        : false,
    };
  }

  async patchSettings(
    userId: string,
    locationId: string,
    input: z.infer<typeof patchLateNightSettingsSchema>,
  ) {
    await this.assertProviderStaff(userId, locationId);

    const existing = await this.db
      .select()
      .from(lateNightProviderSettings)
      .where(eq(lateNightProviderSettings.providerLocationId, locationId))
      .limit(1);

    const next = {
      enabled: input.enabled ?? existing[0]?.enabled ?? false,
      startsAt: input.startsAt ?? formatTime(existing[0]?.startsAt ?? "20:30"),
      endsAt: input.endsAt ?? formatTime(existing[0]?.endsAt ?? "02:00"),
      updatedAt: new Date(),
    };

    await this.db
      .insert(lateNightProviderSettings)
      .values({
        providerLocationId: locationId,
        enabled: next.enabled,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        updatedAt: next.updatedAt,
      })
      .onConflictDoUpdate({
        target: lateNightProviderSettings.providerLocationId,
        set: {
          enabled: next.enabled,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          updatedAt: next.updatedAt,
        },
      });

    return this.getSettings(userId, locationId);
  }

  private async assertProviderStaff(userId: string, locationId: string) {
    const loc = await this.db
      .select({
        providerId: providerLocations.providerId,
      })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!loc[0]) throw new PickiError("NOT_FOUND", "Location not found");

    const member = await this.db
      .select()
      .from(providerMembers)
      .where(
        and(
          eq(providerMembers.providerId, loc[0].providerId),
          eq(providerMembers.userId, userId),
        ),
      )
      .limit(1);
    if (!member[0]) throw new PickiError("FORBIDDEN", "Not a provider staff");
  }
}
