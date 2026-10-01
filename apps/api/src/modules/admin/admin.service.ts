import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  canAdminSystemCancel,
  geoJsonToOuterRing,
  getServiceAreaGeoJson,
  getZoneBoundaryGeoJson,
  deliveryPromotions,
  orders,
  providerLocations,
  providerZoneMemberships,
  providers,
  issueLocationQr,
  publishZoneBoundary,
  ringToMultiPolygonGeoJson,
  setLocationVerification,
  VerifiedQrError,
  runners,
  upsertServiceArea,
  userZoneMemberships,
  users,
  zones,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import type { z } from "zod";
import type {
  adminOrderActionSchema,
  createDeliveryPromotionSchema,
  issueLocationQrSchema,
  setLocationVerificationSchema,
  publishBoundarySchema,
  updateAnchorSchema,
  upsertServiceAreaSchema,
  verifyLocationPinSchema,
} from "./dto.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
  ) {}

  async dashboard() {
    const [orderStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${orders.status} not in ('DELIVERED', 'CUSTOMER_CANCELLED', 'SYSTEM_CANCELLED', 'PROVIDER_REJECTED', 'PAYMENT_FAILED', 'REFUNDED'))`,
      })
      .from(orders);

    const [memberStats] = await this.db.select({ total: count() }).from(userZoneMemberships);
    const [providerStats] = await this.db.select({ total: count() }).from(providerLocations);
    const [runnerStats] = await this.db
      .select({ total: count() })
      .from(runners)
      .where(eq(runners.status, "ACTIVE"));

    const byStatus = await this.db
      .select({ status: orders.status, total: count() })
      .from(orders)
      .groupBy(orders.status);

    return {
      orders: {
        total: Number(orderStats?.total ?? 0),
        active: Number(orderStats?.active ?? 0),
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.total) })),
      },
      members: Number(memberStats?.total ?? 0),
      providerLocations: Number(providerStats?.total ?? 0),
      activeRunners: Number(runnerStats?.total ?? 0),
    };
  }

  async listZones() {
    const rows = await this.db.select().from(zones).orderBy(zones.displayName);
    return {
      zones: await Promise.all(
        rows.map(async (z) => {
          const [members] = await this.db
            .select({ total: count() })
            .from(userZoneMemberships)
            .where(eq(userZoneMemberships.zoneId, z.id));
          const [locs] = await this.db
            .select({ total: count() })
            .from(providerZoneMemberships)
            .where(eq(providerZoneMemberships.zoneId, z.id));
          return {
            id: z.id,
            slug: z.slug,
            displayName: z.displayName,
            status: z.status,
            anchorLat: z.anchorLat,
            anchorLng: z.anchorLng,
            memberCount: Number(members?.total ?? 0),
            providerLocationCount: Number(locs?.total ?? 0),
          };
        }),
      ),
    };
  }

  async getZoneGeo(zoneId: string) {
    const zone = await this.requireZone(zoneId);
    const [boundary, core, primary, extended] = await Promise.all([
      getZoneBoundaryGeoJson(this.sql, zone.id),
      getServiceAreaGeoJson(this.sql, zone.id, "CORE"),
      getServiceAreaGeoJson(this.sql, zone.id, "PRIMARY"),
      getServiceAreaGeoJson(this.sql, zone.id, "EXTENDED"),
    ]);

    const versionRows = await this.sql<
      { version: number; change_reason: string | null; valid_from: string; created_by: string | null }[]
    >`
      SELECT version, change_reason, valid_from::text, created_by::text
      FROM zone_boundary_versions
      WHERE zone_id = ${zone.id}::uuid AND valid_to IS NULL
      LIMIT 1
    `;
    const current = versionRows[0];

    const locations = await this.db
      .select({
        locationId: providerLocations.id,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        addressLine: providerLocations.addressLine,
        lat: providerLocations.lat,
        lng: providerLocations.lng,
        status: providerLocations.status,
        pinVerifiedAt: providerLocations.pinVerifiedAt,
        pinNote: providerLocations.pinNote,
        verificationStatus: providerLocations.verificationStatus,
        verificationNote: providerLocations.verificationNote,
        hasVerifiedQr: sql<boolean>`${providerLocations.verifiedQrToken} IS NOT NULL`,
      })
      .from(providerZoneMemberships)
      .innerJoin(
        providerLocations,
        eq(providerLocations.id, providerZoneMemberships.providerLocationId),
      )
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(
        and(
          eq(providerZoneMemberships.zoneId, zone.id),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .orderBy(providers.brandName);

    return {
      zone: {
        id: zone.id,
        slug: zone.slug,
        displayName: zone.displayName,
        status: zone.status,
        anchor: { lat: zone.anchorLat, lng: zone.anchorLng },
      },
      boundary: {
        geojson: boundary,
        ring: geoJsonToOuterRing(boundary),
        version: current?.version ?? null,
        changeReason: current?.change_reason ?? null,
        validFrom: current?.valid_from ?? null,
      },
      serviceAreas: {
        CORE: { geojson: core, ring: geoJsonToOuterRing(core) },
        PRIMARY: { geojson: primary, ring: geoJsonToOuterRing(primary) },
        EXTENDED: { geojson: extended, ring: geoJsonToOuterRing(extended) },
      },
      locations: locations.map((l) => ({
        locationId: l.locationId,
        brandName: l.brandName,
        displayName: l.displayName,
        addressLine: l.addressLine,
        lat: l.lat,
        lng: l.lng,
        status: l.status,
        pinVerifiedAt: l.pinVerifiedAt?.toISOString() ?? null,
        pinNote: l.pinNote,
        needsPin: l.lat == null || l.lng == null || l.pinVerifiedAt == null,
        verificationStatus: l.verificationStatus,
        verificationNote: l.verificationNote,
        hasVerifiedQr: l.hasVerifiedQr,
      })),
    };
  }

  async publishBoundary(
    adminUserId: string,
    zoneId: string,
    input: z.infer<typeof publishBoundarySchema>,
  ) {
    await this.requireZone(zoneId);
    let geojson;
    try {
      geojson = ringToMultiPolygonGeoJson(input.ring);
    } catch {
      throw new PickiError("VALIDATION_ERROR", "Polygon không hợp lệ (cần ≥ 3 đỉnh)");
    }

    const valid = await this.sql<{ ok: boolean }[]>`
      SELECT ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geojson)}), 4326)) AS ok
    `;
    if (!valid[0]?.ok) {
      throw new PickiError("VALIDATION_ERROR", "Polygon geometry không hợp lệ (tự cắt?)");
    }

    const result = await publishZoneBoundary(this.sql, {
      zoneId,
      geojson,
      changeReason: input.changeReason,
      createdBy: adminUserId,
    });

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_BOUNDARY_PUBLISH",
      entityType: "zone",
      entityId: zoneId,
      metadata: { version: result.version, changeReason: input.changeReason },
    });

    return { ok: true, version: result.version, boundaryId: result.boundaryId };
  }

  async upsertZoneServiceArea(
    adminUserId: string,
    zoneId: string,
    input: z.infer<typeof upsertServiceAreaSchema>,
  ) {
    await this.requireZone(zoneId);
    let geojson;
    try {
      geojson = ringToMultiPolygonGeoJson(input.ring);
    } catch {
      throw new PickiError("VALIDATION_ERROR", "Polygon không hợp lệ");
    }

    const result = await upsertServiceArea(this.sql, {
      zoneId,
      kind: input.kind,
      geojson,
    });

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_SERVICE_AREA_UPSERT",
      entityType: "zone",
      entityId: zoneId,
      metadata: { kind: input.kind, serviceAreaId: result.id },
    });

    return { ok: true, id: result.id, kind: result.kind };
  }

  async updateAnchor(
    adminUserId: string,
    zoneId: string,
    input: z.infer<typeof updateAnchorSchema>,
  ) {
    const zone = await this.requireZone(zoneId);
    await this.db
      .update(zones)
      .set({
        anchorLat: input.lat,
        anchorLng: input.lng,
        updatedAt: new Date(),
      })
      .where(eq(zones.id, zoneId));

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_ANCHOR_UPDATE",
      entityType: "zone",
      entityId: zoneId,
      metadata: {
        from: { lat: zone.anchorLat, lng: zone.anchorLng },
        to: { lat: input.lat, lng: input.lng },
      },
    });

    return { ok: true, anchor: { lat: input.lat, lng: input.lng } };
  }

  async verifyLocationPin(
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof verifyLocationPinSchema>,
  ) {
    const row = await this.db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!row[0]) throw new PickiError("NOT_FOUND", "Location not found");

    await this.db
      .update(providerLocations)
      .set({
        lat: input.lat,
        lng: input.lng,
        addressLine: input.addressLine?.trim() || row[0].addressLine,
        pinVerifiedAt: input.verified ? new Date() : null,
        pinVerifiedBy: input.verified ? adminUserId : null,
        pinNote: input.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(providerLocations.id, locationId));

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: input.verified ? "LOCATION_PIN_VERIFY" : "LOCATION_PIN_UPDATE",
      entityType: "provider_location",
      entityId: locationId,
      metadata: {
        lat: input.lat,
        lng: input.lng,
        note: input.note ?? null,
        verified: input.verified,
      },
    });

    return {
      ok: true,
      locationId,
      lat: input.lat,
      lng: input.lng,
      pinVerifiedAt: input.verified ? new Date().toISOString() : null,
    };
  }

  async listOrders(limit = 50) {
    const rows = await this.db
      .select({
        order: orders,
        zoneSlug: zones.slug,
        zoneName: zones.displayName,
        locationName: providerLocations.displayName,
        brandName: providers.brandName,
      })
      .from(orders)
      .innerJoin(zones, eq(orders.zoneId, zones.id))
      .innerJoin(providerLocations, eq(orders.providerLocationId, providerLocations.id))
      .innerJoin(providers, eq(providerLocations.providerId, providers.id))
      .orderBy(desc(orders.createdAt))
      .limit(Math.min(limit, 100));

    return {
      orders: rows.map((r) => ({
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        status: r.order.status,
        totalVnd: r.order.totalVnd,
        paymentMode: r.order.paymentMode,
        zone: { slug: r.zoneSlug, displayName: r.zoneName },
        provider: { brandName: r.brandName, locationName: r.locationName },
        delivery: {
          building: r.order.deliveryBuilding,
          apartment: r.order.deliveryApartment,
        },
        createdAt: r.order.createdAt.toISOString(),
      })),
    };
  }

  async applyOrderAction(
    adminUserId: string,
    orderId: string,
    input: z.infer<typeof adminOrderActionSchema>,
  ) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    if (input.action === "cancel") {
      if (!canAdminSystemCancel(order.status)) {
        throw new PickiError("FORBIDDEN", `Cannot cancel order in status ${order.status}`);
      }

      const result = await this.transitions.adminTransition(
        orderId,
        "SYSTEM_CANCELLED",
        adminUserId,
        input.reason ? `Admin: ${input.reason}` : "Admin cancel",
      );

      await this.db.insert(auditLogs).values({
        actorUserId: adminUserId,
        action: "ORDER_CANCEL",
        entityType: "order",
        entityId: orderId,
        metadata: { fromStatus: order.status, reason: input.reason ?? null },
      });

      return {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
      };
    }

    throw new PickiError("VALIDATION_ERROR", "Unknown action");
  }

  async listAuditLogs(limit = 50) {
    const rows = await this.db
      .select({
        log: auditLogs,
        actorName: users.displayName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(limit, 100));

    return {
      logs: rows.map((r) => ({
        id: r.log.id,
        action: r.log.action,
        entityType: r.log.entityType,
        entityId: r.log.entityId,
        actorName: r.actorName ?? "System",
        metadata: r.log.metadata,
        createdAt: r.log.createdAt.toISOString(),
      })),
    };
  }

  async listDeliveryPromotions(zoneId?: string) {
    const rows = await this.db
      .select()
      .from(deliveryPromotions)
      .where(zoneId ? eq(deliveryPromotions.zoneId, zoneId) : sql`true`)
      .orderBy(desc(deliveryPromotions.startsAt));
    return {
      promotions: rows.map((row) => ({
        id: row.id,
        name: row.name,
        sponsorType: row.sponsorType,
        subsidyMode: row.subsidyMode,
        zoneId: row.zoneId,
        providerId: row.providerId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        minimumOrderVnd: row.minimumOrderVnd,
        maxSubsidyPerOrderVnd: row.maxSubsidyPerOrderVnd,
        providerShareVnd: row.providerShareVnd,
        pickeeShareVnd: row.pickeeShareVnd,
        usageLimitTotal: row.usageLimitTotal,
        usageLimitPerUser: row.usageLimitPerUser,
        usageLimitPerUserPerDay: row.usageLimitPerUserPerDay,
        budgetVnd: row.budgetVnd,
        budgetSpentVnd: row.budgetSpentVnd,
        eligibleModes: row.eligibleModes.split(",").map((mode) => mode.trim()),
        active: row.active,
      })),
    };
  }

  async createDeliveryPromotion(
    adminUserId: string,
    input: z.infer<typeof createDeliveryPromotionSchema>,
  ) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!(endsAt > startsAt)) {
      throw new PickiError("VALIDATION_ERROR", "Campaign phải kết thúc sau lúc bắt đầu");
    }
    if (input.subsidyMode === "COVER_UP_TO" && input.sponsorType === "SHARED") {
      throw new PickiError("VALIDATION_ERROR", "Chung tiền dùng subsidyMode SHARED_AMOUNTS");
    }
    if (input.subsidyMode === "SHARED_AMOUNTS") {
      if (input.sponsorType !== "SHARED") {
        throw new PickiError("VALIDATION_ERROR", "SHARED_AMOUNTS cần sponsorType SHARED");
      }
      if (input.providerShareVnd + input.pickeeShareVnd <= 0) {
        throw new PickiError("VALIDATION_ERROR", "Cần phần quán hoặc phần Pickee");
      }
      if (input.providerShareVnd + input.pickeeShareVnd > input.maxSubsidyPerOrderVnd) {
        throw new PickiError("VALIDATION_ERROR", "Tổng phần trợ giá vượt trần mỗi đơn");
      }
    }
    await this.requireZone(input.zoneId);
    if (input.providerId) {
      const provider = await this.db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.id, input.providerId))
        .limit(1);
      if (!provider[0]) throw new PickiError("NOT_FOUND", "Provider not found");
    }

    const [row] = await this.db
      .insert(deliveryPromotions)
      .values({
        name: input.name,
        sponsorType: input.sponsorType,
        subsidyMode: input.subsidyMode,
        zoneId: input.zoneId,
        providerId: input.providerId ?? null,
        startsAt,
        endsAt,
        minimumOrderVnd: input.minimumOrderVnd,
        maxSubsidyPerOrderVnd: input.maxSubsidyPerOrderVnd,
        providerShareVnd: input.providerShareVnd,
        pickeeShareVnd: input.pickeeShareVnd,
        usageLimitTotal: input.usageLimitTotal ?? null,
        usageLimitPerUser: input.usageLimitPerUser ?? null,
        usageLimitPerUserPerDay: input.usageLimitPerUserPerDay ?? null,
        budgetVnd: input.budgetVnd ?? null,
        eligibleModes: input.eligibleModes.join(","),
      })
      .returning();
    if (!row) throw new PickiError("INTERNAL_ERROR", "Failed to create promotion");

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "DELIVERY_PROMOTION_CREATE",
      entityType: "delivery_promotion",
      entityId: row.id,
      metadata: {
        name: row.name,
        zoneId: row.zoneId,
        sponsorType: row.sponsorType,
        maxSubsidyPerOrderVnd: row.maxSubsidyPerOrderVnd,
        eligibleModes: row.eligibleModes,
      },
    });

    return { id: row.id };
  }

  async setLocationVerification(
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof setLocationVerificationSchema>,
  ) {
    try {
      return await setLocationVerification(this.db, {
        locationId,
        status: input.status,
        note: input.note,
        actorUserId: adminUserId,
      });
    } catch (err) {
      throw this.qrError(err);
    }
  }

  async issueLocationQr(
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof issueLocationQrSchema>,
  ) {
    try {
      const issued = await issueLocationQr(this.db, {
        locationId,
        actorUserId: adminUserId,
        reason: input.reason,
      });
      return {
        locationId: issued.locationId,
        token: issued.token,
        reissued: issued.reissued,
        path: `/v/${issued.token}`,
      };
    } catch (err) {
      throw this.qrError(err);
    }
  }

  async listShops() {
    const rows = await this.db
      .select({
        locationId: providerLocations.id,
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
        status: providerLocations.status,
        verificationStatus: providerLocations.verificationStatus,
        verificationNote: providerLocations.verificationNote,
        qrToken: providerLocations.verifiedQrToken,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .orderBy(providers.brandName, providerLocations.displayName);

    return {
      shops: rows.map((row) => ({
        locationId: row.locationId,
        brandName: row.brandName,
        displayName: row.displayName,
        status: row.status,
        verificationStatus: row.verificationStatus,
        verificationNote: row.verificationNote,
        qrPath: row.qrToken ? `/v/${row.qrToken}` : null,
      })),
    };
  }

  private qrError(err: unknown): Error {
    if (err instanceof VerifiedQrError) {
      throw new PickiError(err.code, err.message);
    }
    throw err;
  }

  private async requireZone(zoneId: string) {
    const rows = await this.db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!rows[0]) throw new PickiError("NOT_FOUND", "Zone not found");
    return rows[0];
  }
}
