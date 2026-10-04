import { Inject, Injectable } from "@nestjs/common";
import { and, eq, or, type SQL } from "drizzle-orm";
import {
  countActiveProvidersInZone,
  countZoneMembers,
  discoverZonesAtPoint,
  listActiveProvidersInZone,
  userZoneMemberships,
  zonePlaces,
  type PickiDb,
  type PickiSql,
  zones,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";

export type ZonePreview = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  status: string;
  memberCount: number;
  providerCount: number;
  tagline: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPickiUuid(value: string): boolean {
  return UUID_RE.test(value);
}

@Injectable()
export class ZonesService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
  ) {}

  async discover(lat: number, lng: number) {
    const found = await discoverZonesAtPoint(this.sql, { lat, lng });
    const previews = await Promise.all(
      found.map(async (z) => this.buildPreview(z.zone_id, z.slug, z.name, z.display_name, z.status)),
    );
    return { zones: previews };
  }

  async previewBySlugOrId(slugOrId: string): Promise<ZonePreview> {
    const zone = await this.findZone(slugOrId);
    if (!zone) {
      throw new PickiError("NOT_FOUND", "Zone not found");
    }
    return this.buildPreview(zone.id, zone.slug, zone.name, zone.displayName, zone.status);
  }

  async findZone(slugOrId: string) {
    const where: SQL = isPickiUuid(slugOrId)
      ? or(eq(zones.slug, slugOrId), eq(zones.id, slugOrId))!
      : eq(zones.slug, slugOrId);

    const rows = await this.db.select().from(zones).where(where).limit(1);
    return rows[0];
  }

  async listProviders(slugOrId: string) {
    const zone = await this.findZone(slugOrId);
    if (!zone) {
      throw new PickiError("NOT_FOUND", "Zone not found");
    }

    const rows = await listActiveProvidersInZone(this.sql, zone.id);
    return {
      zoneId: zone.id,
      providers: rows.map((r) => ({
        locationId: r.location_id,
        providerId: r.provider_id,
        brandName: r.brand_name,
        displayName: r.display_name,
        providerType: r.provider_type,
        tagline: r.tagline,
        liveStatus: r.live_status,
        addressLine: r.address_line,
        prepMinutes: r.prep_minutes,
        etaMinutes: r.eta_minutes,
        lat: r.lat,
        lng: r.lng,
      })),
    };
  }

  async listPlaces(userId: string, zoneId: string) {
    const member = await this.db
      .select({ id: userZoneMemberships.id })
      .from(userZoneMemberships)
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.zoneId, zoneId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      )
      .limit(1);
    if (!member[0]) throw new PickiError("FORBIDDEN", "Chưa tham gia Zone này");

    const rows = await this.db
      .select()
      .from(zonePlaces)
      .where(and(eq(zonePlaces.zoneId, zoneId), eq(zonePlaces.status, "ACTIVE")))
      .orderBy(zonePlaces.code);
    return {
      places: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        code: row.code,
        displayName: row.displayName,
        elevatorNote: row.elevatorNote,
        accessCardRequired: row.accessCardRequired,
        securityNote: row.securityNote,
        callUpRequired: row.callUpRequired,
        doorDeliveryAllowed: row.doorDeliveryAllowed,
        lobbyWaitMinutes: row.lobbyWaitMinutes,
        doorWaitMinutes: row.doorWaitMinutes,
        runnerFeePerMinuteVnd: row.runnerFeePerMinuteVnd,
        notes: row.notes,
      })),
    };
  }

  private async buildPreview(
    id: string,
    slug: string,
    name: string,
    displayName: string,
    status: string,
  ): Promise<ZonePreview> {
    const memberCount = await countZoneMembers(this.sql, id);
    const providerCount = await countActiveProvidersInZone(this.sql, id);
    return {
      id,
      slug,
      name,
      displayName,
      status,
      memberCount,
      providerCount,
      tagline: "Hôm nay quanh bạn có gì?",
    };
  }
}
