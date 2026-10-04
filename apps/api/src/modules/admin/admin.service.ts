import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  auditLogs,
  canAdminSystemCancel,
  geoJsonToOuterRing,
  getServiceAreaGeoJson,
  getZoneBoundaryGeoJson,
  deliveryPromotions,
  orders,
  providerCapabilities,
  providerLocations,
  providerZoneMemberships,
  providers,
  issueLocationQr,
  publishZoneBoundary,
  ringToMultiPolygonGeoJson,
  setLocationVerification,
  VerifiedQrError,
  runners,
  runnerPresence,
  upsertServiceArea,
  userZoneMemberships,
  zoneFulfillmentSettings,
  zoneSettings,
  userIdentities,
  userAddresses,
  addresses,
  users,
  zones,
  zonePlaces,
  experienceCities,
  homeHeroImages,
  offerings,
  productCategories,
  productDailyAvailability,
  applyLocalPostZoneReview,
  providerDailyUpdates,
  providerDailyUpdateZoneTargets,
  commerceServiceDate,
  normalizePlaceCode,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import {
  DRAFT_BEER_CAPABILITY,
  MARKET_FEATURED_QUOTA,
  PickiError,
  canConfigureZone,
  canOperateLocation,
  canOperateZone,
  canReadCity,
  canReadGlobal,
  canReadZone,
  canWriteCity,
  canWriteGlobal,
  isDiscoverySurface,
  surfacesForCommerce,
  type AdminAccess,
} from "@picki/shared";
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
  upsertZonePlaceSchema,
  homeHeroImageSchema,
  saveHomeHeroSchema,
} from "./dto.js";
import { saveHomeHeroImage } from "./hero-image.js";
import { isRunnerDocKind, readRunnerDocument } from "../runner/documents.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
  ) {}

  private deny(message: string): never {
    throw new PickiError("FORBIDDEN", message);
  }

  private assertReadGlobal(access: AdminAccess) {
    if (!canReadGlobal(access)) this.deny("Chỉ Super admin hoặc Support xem được phần toàn hệ thống");
  }

  private assertWriteGlobal(access: AdminAccess) {
    if (!canWriteGlobal(access)) this.deny("Chỉ Super admin sửa được phần toàn hệ thống");
  }

  private assertReadZone(access: AdminAccess, zoneId: string) {
    if (!canReadZone(access, zoneId)) this.deny("Không có quyền xem khu vực này");
  }

  private assertOperateZone(access: AdminAccess, zoneId: string) {
    if (!canOperateZone(access, zoneId)) this.deny("Không có quyền sửa khu vực này");
  }

  private assertConfigureZone(access: AdminAccess, zoneId: string) {
    if (!canConfigureZone(access, zoneId)) this.deny("Không có quyền cấu hình khu vực này");
  }

  private async resolveZone(key: string) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);
    const rows = await this.db
      .select()
      .from(zones)
      .where(uuid ? eq(zones.id, key) : eq(zones.slug, key))
      .limit(1);
    const zone = rows[0];
    if (!zone) throw new PickiError("NOT_FOUND", "Không thấy khu vực");
    return zone;
  }

  private async locationZoneIds(locationId: string) {
    const rows = await this.db
      .select({ zoneId: providerZoneMemberships.zoneId })
      .from(providerZoneMemberships)
      .where(
        and(
          eq(providerZoneMemberships.providerLocationId, locationId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      );
    return rows.map((row) => row.zoneId);
  }

  private async actingZoneForLocation(access: AdminAccess, locationId: string, zoneKey?: string) {
    const memberships = await this.locationZoneIds(locationId);
    if (memberships.length === 0) throw new PickiError("NOT_FOUND", "Không thấy quán trong khu vực");
    const acting = zoneKey ? (await this.resolveZone(zoneKey)).id : memberships.length === 1 ? memberships[0]! : null;
    if (!acting || !memberships.includes(acting)) {
      throw new PickiError("NOT_FOUND", "Không thấy quán trong khu vực này");
    }
    if (!canOperateLocation(access, memberships, acting)) {
      throw new PickiError("FORBIDDEN", "Không có quyền sửa quán này");
    }
    return acting;
  }

  async readZone(access: AdminAccess, zoneKey: string) {
    const zone = await this.resolveZone(zoneKey);
    this.assertReadZone(access, zone.id);
    return zone;
  }

  async session(access: AdminAccess) {
    const allowed = access.superAdmin ? null : Object.keys(access.zones);
    const rows = await this.db.select().from(zones).orderBy(zones.displayName);
    const cityRows = await this.db
      .select()
      .from(experienceCities)
      .where(eq(experienceCities.enabled, true));
    return {
      superAdmin: access.superAdmin,
      supportReadOnlyGlobal: access.supportReadOnlyGlobal,
      financeGlobal: access.financeGlobal,
      zones: rows
        .filter((zone) => allowed == null || allowed.includes(zone.id))
        .map((zone) => ({
          id: zone.id,
          slug: zone.slug,
          displayName: zone.displayName,
          status: zone.status,
          access: access.superAdmin ? ("admin" as const) : access.zones[zone.id],
        })),
      cities: cityRows
        .filter(
          (city) =>
            access.superAdmin || access.supportReadOnlyGlobal || access.cities[city.id] != null,
        )
        .map((city) => ({
          id: city.id,
          code: city.code,
          slug: city.slug,
          label: city.label,
          access:
            access.superAdmin || access.cities[city.id] === "admin"
              ? ("admin" as const)
              : ("support" as const),
        })),
    };
  }

  async dashboard(zoneId?: string) {
    const orderWhere = zoneId ? eq(orders.zoneId, zoneId) : undefined;
    const [orderStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${orders.status} not in ('DELIVERED', 'CUSTOMER_CANCELLED', 'SYSTEM_CANCELLED', 'PROVIDER_REJECTED', 'PAYMENT_FAILED', 'REFUNDED'))`,
      })
      .from(orders)
      .where(orderWhere);

    const [memberStats] = zoneId
      ? await this.db
          .select({ total: count() })
          .from(userZoneMemberships)
          .where(eq(userZoneMemberships.zoneId, zoneId))
      : await this.db.select({ total: count() }).from(users);
    const [providerStats] = zoneId
      ? await this.db
          .select({ total: count() })
          .from(providerZoneMemberships)
          .where(
            and(eq(providerZoneMemberships.zoneId, zoneId), eq(providerZoneMemberships.status, "ACTIVE")),
          )
      : await this.db.select({ total: count() }).from(providerLocations);
    const [runnerStats] = await this.db
      .select({ total: count() })
      .from(runners)
      .where(zoneId ? and(eq(runners.status, "ACTIVE"), eq(runners.zoneId, zoneId)) : eq(runners.status, "ACTIVE"));

    const byStatus = await this.db
      .select({ status: orders.status, total: count() })
      .from(orders)
      .where(orderWhere)
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

  async listAccounts(zoneId?: string) {
    const people = zoneId
      ? await this.db
          .select({
            id: users.id,
            displayName: users.displayName,
            declaredFullName: users.declaredFullName,
            declaredDateOfBirth: users.declaredDateOfBirth,
            createdAt: users.createdAt,
          })
          .from(users)
          .innerJoin(
            userZoneMemberships,
            and(eq(userZoneMemberships.userId, users.id), eq(userZoneMemberships.zoneId, zoneId)),
          )
          .orderBy(desc(users.createdAt))
      : await this.db
          .select({
            id: users.id,
            displayName: users.displayName,
            declaredFullName: users.declaredFullName,
            declaredDateOfBirth: users.declaredDateOfBirth,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt));
    const identities = await this.db
      .select({
        userId: userIdentities.userId,
        provider: userIdentities.provider,
        externalUserId: userIdentities.externalUserId,
      })
      .from(userIdentities);
    const places = await this.db
      .select({
        userId: userAddresses.userId,
        building: addresses.building,
        floor: addresses.floor,
        apartment: addresses.apartment,
        houseNumber: addresses.houseNumber,
        alley: addresses.alley,
        street: addresses.street,
        ward: addresses.ward,
      })
      .from(userAddresses)
      .innerJoin(addresses, eq(addresses.id, userAddresses.addressId))
      .where(zoneId ? eq(userAddresses.zoneId, zoneId) : undefined);
    const phoneByUser = new Map<string, string>();
    const zaloByUser = new Map<string, boolean>();
    for (const row of identities) {
      if (row.provider === "PHONE" && !phoneByUser.has(row.userId)) {
        phoneByUser.set(row.userId, row.externalUserId);
      }
      if (row.provider === "ZALO") zaloByUser.set(row.userId, true);
    }
    const addressByUser = new Map<string, string[]>();
    for (const row of places) {
      const line = [
        row.building,
        row.apartment ? `căn ${row.apartment}` : null,
        row.floor ? `tầng ${row.floor}` : null,
        row.houseNumber,
        row.alley ? `ngõ ${row.alley}` : null,
        row.street,
        row.ward,
      ]
        .filter((part): part is string => !!part)
        .join(", ");
      if (!line) continue;
      const list = addressByUser.get(row.userId) ?? [];
      list.push(line);
      addressByUser.set(row.userId, list);
    }
    return {
      accounts: people.map((row) => ({
        id: row.id,
        displayName: row.displayName,
        fullName: row.declaredFullName,
        phone: phoneByUser.get(row.id) ?? null,
        zaloLinked: zaloByUser.get(row.id) === true,
        dateOfBirth: row.declaredDateOfBirth,
        addresses: addressByUser.get(row.id) ?? [],
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async listRunners(zoneId?: string) {
    const rows = await this.db
      .select({
        id: runners.id,
        status: runners.status,
        createdAt: runners.createdAt,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        phone: userIdentities.externalUserId,
        zoneName: zones.displayName,
        presence: runnerPresence.status,
        cccdNumber: runners.cccdNumber,
        cccdFullName: runners.cccdFullName,
        hasCccdFront: runners.cccdFrontFile,
        hasCccdBack: runners.cccdBackFile,
        vehiclePlate: runners.vehiclePlate,
        hasVehicleDoc: runners.vehicleDocFile,
        payoutBankName: runners.payoutBankName,
        payoutAccountNumber: runners.payoutAccountNumber,
        payoutAccountHolder: runners.payoutAccountHolder,
      })
      .from(runners)
      .innerJoin(users, eq(users.id, runners.userId))
      .innerJoin(zones, eq(zones.id, runners.zoneId))
      .leftJoin(runnerPresence, eq(runnerPresence.runnerId, runners.id))
      .leftJoin(
        userIdentities,
        and(eq(userIdentities.userId, users.id), eq(userIdentities.provider, "PHONE")),
      )
      .where(zoneId ? eq(runners.zoneId, zoneId) : undefined)
      .orderBy(users.displayName);
    return {
      runners: rows.map((row) => ({
        id: row.id,
        status: row.status,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        phone: row.phone,
        zoneName: row.zoneName,
        presence: row.presence ?? "OFFLINE",
        createdAt: row.createdAt.toISOString(),
        cccdNumber: row.cccdNumber,
        cccdFullName: row.cccdFullName,
        hasCccdFront: Boolean(row.hasCccdFront),
        hasCccdBack: Boolean(row.hasCccdBack),
        vehiclePlate: row.vehiclePlate,
        hasVehicleDoc: Boolean(row.hasVehicleDoc),
        payoutBankName: row.payoutBankName,
        payoutAccountNumber: row.payoutAccountNumber,
        payoutAccountHolder: row.payoutAccountHolder,
      })),
    };
  }

  async runnerDocument(access: AdminAccess, runnerId: string, kind: string) {
    if (!isRunnerDocKind(kind)) throw new PickiError("NOT_FOUND", "Không thấy ảnh");
    const [runner] = await this.db
      .select({ zoneId: runners.zoneId })
      .from(runners)
      .where(eq(runners.id, runnerId))
      .limit(1);
    if (!runner || !canReadZone(access, runner.zoneId)) throw new PickiError("NOT_FOUND", "Không thấy tài xế");
    const [row] = await this.db
      .select({
        cccdFrontFile: runners.cccdFrontFile,
        cccdBackFile: runners.cccdBackFile,
        vehicleDocFile: runners.vehicleDocFile,
      })
      .from(runners)
      .where(eq(runners.id, runnerId))
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy tài xế");
    const file =
      kind === "cccd-front" ? row.cccdFrontFile : kind === "cccd-back" ? row.cccdBackFile : row.vehicleDocFile;
    if (!file) throw new PickiError("NOT_FOUND", "Chưa có ảnh");
    return { dataUrl: await readRunnerDocument(file) };
  }

  async setRunnerOperations(
    access: AdminAccess,
    adminUserId: string,
    runnerId: string,
    paused: boolean,
    zoneKey?: string,
  ) {
    const [row] = await this.db
      .select({ id: runners.id, status: runners.status, zoneId: runners.zoneId })
      .from(runners)
      .where(eq(runners.id, runnerId))
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy tài xế");
    if (zoneKey) {
      const zone = await this.resolveZone(zoneKey);
      if (zone.id !== row.zoneId) throw new PickiError("NOT_FOUND", "Không thấy tài xế");
    }
    this.assertOperateZone(access, row.zoneId);
    if (paused && row.status !== "ACTIVE") {
      throw new PickiError("CONFLICT", "Chỉ tạm dừng tài xế đang chạy");
    }
    if (!paused && row.status !== "PAUSED") {
      throw new PickiError("CONFLICT", "Tài xế không đang tạm dừng");
    }
    const status = paused ? "PAUSED" : "ACTIVE";
    await this.db.update(runners).set({ status }).where(eq(runners.id, runnerId));
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: paused ? "RUNNER_PAUSE" : "RUNNER_RESUME",
      entityType: "runner",
      entityId: runnerId,
      zoneId: row.zoneId,
    });
    return this.listRunners(row.zoneId);
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
          const [runnerCount] = await this.db
            .select({ total: count() })
            .from(runners)
            .where(eq(runners.zoneId, z.id));
          const [orderCount] = await this.db
            .select({ total: count() })
            .from(orders)
            .where(eq(orders.zoneId, z.id));
          return {
            id: z.id,
            slug: z.slug,
            displayName: z.displayName,
            status: z.status,
            anchorLat: z.anchorLat,
            anchorLng: z.anchorLng,
            memberCount: Number(members?.total ?? 0),
            providerLocationCount: Number(locs?.total ?? 0),
            runnerCount: Number(runnerCount?.total ?? 0),
            orderCount: Number(orderCount?.total ?? 0),
          };
        }),
      ),
    };
  }

  async getZoneGeo(access: AdminAccess, zoneKey: string) {
    const zone = await this.resolveZone(zoneKey);
    this.assertReadZone(access, zone.id);
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
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    input: z.infer<typeof publishBoundarySchema>,
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertWriteGlobal(access);
    const zoneId = zone.id;
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
      zoneId,
    });

    return { ok: true, version: result.version, boundaryId: result.boundaryId };
  }

  async upsertZoneServiceArea(
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    input: z.infer<typeof upsertServiceAreaSchema>,
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertWriteGlobal(access);
    const zoneId = zone.id;
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
      zoneId,
    });

    return { ok: true, id: result.id, kind: result.kind };
  }

  async updateAnchor(
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    input: z.infer<typeof updateAnchorSchema>,
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertWriteGlobal(access);
    await this.db
      .update(zones)
      .set({
        anchorLat: input.lat,
        anchorLng: input.lng,
        updatedAt: new Date(),
      })
      .where(eq(zones.id, zone.id));

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_ANCHOR_UPDATE",
      entityType: "zone",
      entityId: zone.id,
      metadata: {
        from: { lat: zone.anchorLat, lng: zone.anchorLng },
        to: { lat: input.lat, lng: input.lng },
      },
      zoneId: zone.id,
    });

    return { ok: true, anchor: { lat: input.lat, lng: input.lng } };
  }

  async verifyLocationPin(
    access: AdminAccess,
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof verifyLocationPinSchema>,
  ) {
    this.assertWriteGlobal(access);
    const memberships = await this.locationZoneIds(locationId);
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
      zoneId: memberships[0] ?? null,
    });

    return {
      ok: true,
      locationId,
      lat: input.lat,
      lng: input.lng,
      pinVerifiedAt: input.verified ? new Date().toISOString() : null,
    };
  }

  async listOrders(limit = 50, zoneId?: string) {
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
      .where(zoneId ? eq(orders.zoneId, zoneId) : undefined)
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
    access: AdminAccess,
    adminUserId: string,
    orderId: string,
    input: z.infer<typeof adminOrderActionSchema>,
    zoneKey?: string,
  ) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }
    if (zoneKey) {
      const zone = await this.resolveZone(zoneKey);
      if (zone.id !== order.zoneId) throw new PickiError("NOT_FOUND", "Order not found");
    }
    if (!canOperateZone(access, order.zoneId)) {
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
        zoneId: order.zoneId,
      });

      return {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
      };
    }

    throw new PickiError("VALIDATION_ERROR", "Unknown action");
  }

  async listAuditLogs(limit = 50, zoneId?: string) {
    const rows = await this.db
      .select({
        log: auditLogs,
        actorName: users.displayName,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorUserId, users.id))
      .where(zoneId ? eq(auditLogs.zoneId, zoneId) : undefined)
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
    access: AdminAccess,
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
    this.assertConfigureZone(access, input.zoneId);
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
      zoneId: row.zoneId,
    });

    return { id: row.id };
  }

  async setLocationVerification(
    access: AdminAccess,
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof setLocationVerificationSchema>,
    zoneKey?: string,
  ) {
    const zoneId = await this.actingZoneForLocation(access, locationId, zoneKey);
    try {
      return await setLocationVerification(this.db, {
        locationId,
        status: input.status,
        note: input.note,
        actorUserId: adminUserId,
        zoneId,
      });
    } catch (err) {
      throw this.qrError(err);
    }
  }

  async issueLocationQr(
    access: AdminAccess,
    adminUserId: string,
    locationId: string,
    input: z.infer<typeof issueLocationQrSchema>,
    zoneKey?: string,
  ) {
    const zoneId = await this.actingZoneForLocation(access, locationId, zoneKey);
    try {
      const issued = await issueLocationQr(this.db, {
        locationId,
        actorUserId: adminUserId,
        reason: input.reason,
        zoneId,
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

  async listZonePlaces(access: AdminAccess, zoneKey: string) {
    const zone = await this.resolveZone(zoneKey);
    this.assertReadZone(access, zone.id);
    const zoneId = zone.id;
    const rows = await this.db
      .select()
      .from(zonePlaces)
      .where(eq(zonePlaces.zoneId, zoneId))
      .orderBy(zonePlaces.kind, zonePlaces.code);
    return { places: rows.filter((row) => row.status === "ACTIVE").map(toZonePlaceDto) };
  }

  async upsertZonePlace(
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    input: z.infer<typeof upsertZonePlaceSchema>,
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertConfigureZone(access, zone.id);
    const zoneId = zone.id;
    const code = normalizePlaceCode(input.code);
    if (!code) throw new PickiError("VALIDATION_ERROR", "Thiếu mã tòa hoặc khu");
    const clash = await this.db
      .select({ id: zonePlaces.id })
      .from(zonePlaces)
      .where(and(eq(zonePlaces.zoneId, zoneId), eq(zonePlaces.code, code)))
      .limit(1);
    if (clash[0] && clash[0].id !== input.id) {
      throw new PickiError("CONFLICT", `Mã ${code} đã có trong Zone này`);
    }

    const values = {
      kind: input.kind,
      code,
      displayName: input.displayName.trim(),
      elevatorNote: blankText(input.elevatorNote),
      accessCardRequired: input.accessCardRequired,
      securityNote: blankText(input.securityNote),
      callUpRequired: input.callUpRequired,
      doorDeliveryAllowed: input.doorDeliveryAllowed,
      lobbyWaitMinutes: input.lobbyWaitMinutes,
      doorWaitMinutes: input.doorWaitMinutes,
      runnerFeePerMinuteVnd: input.runnerFeePerMinuteVnd,
      doorSurcharge: input.doorSurcharge,
      slowElevatorSurcharge: input.slowElevatorSurcharge,
      elevatorWaitMinutes: input.elevatorWaitMinutes,
      anchorCode: blankText(input.anchorCode),
      notes: blankText(input.notes),
      status: "ACTIVE" as const,
      updatedAt: new Date(),
    };

    const saved = input.id
      ? await this.db
          .update(zonePlaces)
          .set(values)
          .where(and(eq(zonePlaces.id, input.id), eq(zonePlaces.zoneId, zoneId)))
          .returning()
      : await this.db
          .insert(zonePlaces)
          .values({ zoneId, ...values })
          .returning();
    const row = saved[0];
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy tòa / khu để lưu");

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_PLACE_UPSERT",
      entityType: "zone_place",
      entityId: row.id,
      metadata: {
        zoneId,
        code: row.code,
        doorDeliveryAllowed: row.doorDeliveryAllowed,
        runnerFeePerMinuteVnd: row.runnerFeePerMinuteVnd,
      },
      zoneId,
    });
    return { place: toZonePlaceDto(row) };
  }

  async archiveZonePlace(access: AdminAccess, adminUserId: string, zoneKey: string, placeId: string) {
    const zone = await this.resolveZone(zoneKey);
    this.assertConfigureZone(access, zone.id);
    const zoneId = zone.id;
    const saved = await this.db
      .update(zonePlaces)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(zonePlaces.id, placeId), eq(zonePlaces.zoneId, zoneId)))
      .returning();
    const row = saved[0];
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy tòa / khu");
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_PLACE_ARCHIVE",
      entityType: "zone_place",
      entityId: row.id,
      metadata: { zoneId, code: row.code },
      zoneId,
    });
    return { ok: true };
  }

  async listShops(zoneId?: string) {
    const columns = {
      locationId: providerLocations.id,
      providerId: providers.id,
      commerceModel: providers.commerceModel,
      brandName: providers.brandName,
      displayName: providerLocations.displayName,
      status: providerLocations.status,
      verificationStatus: providerLocations.verificationStatus,
      verificationNote: providerLocations.verificationNote,
      qrToken: providerLocations.verifiedQrToken,
      zonePlaceId: providerLocations.zonePlaceId,
    };
    const rows = zoneId
      ? await this.db
          .select(columns)
          .from(providerLocations)
          .innerJoin(providers, eq(providers.id, providerLocations.providerId))
          .innerJoin(
            providerZoneMemberships,
            and(
              eq(providerZoneMemberships.providerLocationId, providerLocations.id),
              eq(providerZoneMemberships.zoneId, zoneId),
              eq(providerZoneMemberships.status, "ACTIVE"),
            ),
          )
          .orderBy(providers.brandName, providerLocations.displayName)
      : await this.db
          .select(columns)
          .from(providerLocations)
          .innerJoin(providers, eq(providers.id, providerLocations.providerId))
          .orderBy(providers.brandName, providerLocations.displayName);

    const caps = await this.db
      .select({ providerId: providerCapabilities.providerId, enabled: providerCapabilities.enabled })
      .from(providerCapabilities)
      .where(eq(providerCapabilities.capability, DRAFT_BEER_CAPABILITY));
    const draftBeer = new Map(caps.map((row) => [row.providerId, row.enabled]));

    return {
      shops: rows.map((row) => ({
        locationId: row.locationId,
        providerId: row.providerId,
        commerceModel: row.commerceModel,
        draftBeerEnabled: draftBeer.get(row.providerId) === true,
        brandName: row.brandName,
        displayName: row.displayName,
        status: row.status,
        verificationStatus: row.verificationStatus,
        verificationNote: row.verificationNote,
        qrPath: row.qrToken ? `/v/${row.qrToken}` : null,
        zonePlaceId: row.zonePlaceId,
      })),
    };
  }

  async assignLocationPlace(
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    locationId: string,
    zonePlaceId: string | null,
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertConfigureZone(access, zone.id);
    const membership = await this.db
      .select({ id: providerZoneMemberships.id })
      .from(providerZoneMemberships)
      .where(
        and(
          eq(providerZoneMemberships.providerLocationId, locationId),
          eq(providerZoneMemberships.zoneId, zone.id),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!membership[0]) throw new PickiError("NOT_FOUND", "Điểm bán không thuộc khu này");
    if (zonePlaceId) {
      const place = await this.db
        .select({ id: zonePlaces.id })
        .from(zonePlaces)
        .where(and(eq(zonePlaces.id, zonePlaceId), eq(zonePlaces.zoneId, zone.id), eq(zonePlaces.status, "ACTIVE")))
        .limit(1);
      if (!place[0]) throw new PickiError("VALIDATION_ERROR", "Tòa hoặc cụm không thuộc khu này");
    }
    await this.db
      .update(providerLocations)
      .set({ zonePlaceId, updatedAt: new Date() })
      .where(eq(providerLocations.id, locationId));
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "LOCATION_ZONE_PLACE",
      entityType: "provider_location",
      entityId: locationId,
      metadata: { zonePlaceId },
      zoneId: zone.id,
    });
    return { ok: true };
  }

  async setDraftBeer(
    access: AdminAccess,
    adminUserId: string,
    locationId: string,
    input: { enabled: boolean; note?: string },
  ) {
    this.assertWriteGlobal(access);
    const [shop] = await this.db
      .select({
        providerId: providers.id,
        commerceModel: providers.commerceModel,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!shop) throw new PickiError("NOT_FOUND", "Không thấy quán");
    if (shop.commerceModel !== "FOOD_SERVICE") {
      throw new PickiError("VALIDATION_ERROR", "Chỉ quán ăn mới bật bia hơi");
    }
    const [existing] = await this.db
      .select({ id: providerCapabilities.id })
      .from(providerCapabilities)
      .where(
        and(
          eq(providerCapabilities.providerId, shop.providerId),
          eq(providerCapabilities.capability, DRAFT_BEER_CAPABILITY),
        ),
      )
      .limit(1);
    if (existing) {
      await this.db
        .update(providerCapabilities)
        .set({ enabled: input.enabled })
        .where(eq(providerCapabilities.id, existing.id));
    } else {
      await this.db.insert(providerCapabilities).values({
        providerId: shop.providerId,
        capability: DRAFT_BEER_CAPABILITY,
        enabled: input.enabled,
      });
    }
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: input.enabled ? "DRAFT_BEER_ENABLE" : "DRAFT_BEER_DISABLE",
      entityType: "provider",
      entityId: shop.providerId,
      metadata: { locationId, note: input.note ?? null },
      zoneId: null,
    });
    return { enabled: input.enabled };
  }

  private async hanoiCity() {
    const rows = await this.db
      .select()
      .from(experienceCities)
      .where(eq(experienceCities.code, "Hanoi"))
      .limit(1);
    const city = rows[0];
    if (!city) throw new PickiError("NOT_FOUND", "Không thấy Hà Nội");
    return city;
  }

  private async assertHeroCity(access: AdminAccess, write: boolean) {
    const city = await this.hanoiCity();
    const allowed = write ? canWriteCity(access, city.id) : canReadCity(access, city.id);
    if (!allowed) {
      this.deny(
        write
          ? "Banner thuộc thành phố. Zone admin không sửa banner."
          : "Banner thuộc thành phố, không mở cho Zone admin",
      );
    }
    return city;
  }

  async listHomeHero(access: AdminAccess) {
    await this.assertHeroCity(access, false);
    const rows = await this.db
      .select()
      .from(homeHeroImages)
      .where(eq(homeHeroImages.city, "Hanoi"))
      .orderBy(asc(homeHeroImages.contextId), asc(homeHeroImages.sortOrder));
    return {
      images: rows.map((row) => ({
        id: row.id,
        contextId: row.contextId,
        imageUrl: row.imageUrl,
        sortOrder: row.sortOrder,
      })),
    };
  }

  async addHomeHero(access: AdminAccess, adminUserId: string, input: z.infer<typeof homeHeroImageSchema>) {
    await this.assertHeroCity(access, true);
    const existing = await this.db
      .select({ id: homeHeroImages.id })
      .from(homeHeroImages)
      .where(and(eq(homeHeroImages.contextId, input.contextId), eq(homeHeroImages.city, "Hanoi")));
    if (existing.length >= 5) {
      throw new PickiError("VALIDATION_ERROR", "Mỗi khung giờ tối đa 5 ảnh");
    }
    const imageUrl = await saveHomeHeroImage(input.dataUrl);
    const [row] = await this.db
      .insert(homeHeroImages)
      .values({
        contextId: input.contextId,
        city: "Hanoi",
        imageUrl,
        sortOrder: existing.length,
      })
      .returning();
    if (!row) throw new PickiError("INTERNAL_ERROR", "Không lưu được ảnh");
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "HOME_HERO_IMAGE_ADD",
      entityType: "home_hero_image",
      entityId: row.id,
      metadata: { contextId: input.contextId, city: "Hanoi" },
    });
    return { id: row.id, contextId: row.contextId, imageUrl: row.imageUrl, sortOrder: row.sortOrder };
  }

  async saveHomeHero(access: AdminAccess, adminUserId: string, input: z.infer<typeof saveHomeHeroSchema>) {
    await this.assertHeroCity(access, true);
    const seen = new Set<string>();
    for (const slot of input.slots) {
      if (!("id" in slot)) continue;
      if (seen.has(slot.id)) throw new PickiError("VALIDATION_ERROR", "Ảnh bị trùng");
      seen.add(slot.id);
    }
    const existing = await this.db
      .select()
      .from(homeHeroImages)
      .where(and(eq(homeHeroImages.contextId, input.contextId), eq(homeHeroImages.city, "Hanoi")));
    const byId = new Map(existing.map((row) => [row.id, row]));
    for (const id of seen) {
      if (!byId.has(id)) throw new PickiError("VALIDATION_ERROR", "Ảnh không thuộc khung giờ này");
    }

    const uploaded: string[] = [];
    for (const slot of input.slots) {
      if ("dataUrl" in slot) uploaded.push(await saveHomeHeroImage(slot.dataUrl));
    }

    let uploadIndex = 0;
    await this.db.transaction(async (tx) => {
      const keep = seen;
      for (const row of existing) {
        if (!keep.has(row.id)) {
          await tx.delete(homeHeroImages).where(eq(homeHeroImages.id, row.id));
        }
      }
      for (let index = 0; index < input.slots.length; index += 1) {
        const slot = input.slots[index]!;
        if ("id" in slot) {
          await tx
            .update(homeHeroImages)
            .set({ sortOrder: index })
            .where(eq(homeHeroImages.id, slot.id));
          continue;
        }
        const imageUrl = uploaded[uploadIndex];
        uploadIndex += 1;
        if (!imageUrl) throw new PickiError("INTERNAL_ERROR", "Không lưu được ảnh");
        await tx.insert(homeHeroImages).values({
          contextId: input.contextId,
          city: "Hanoi",
          imageUrl,
          sortOrder: index,
        });
      }
    });

    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "HOME_HERO_IMAGE_SAVE",
      entityType: "home_hero_image",
      metadata: { contextId: input.contextId, city: "Hanoi", count: input.slots.length },
    });
    return this.listHomeHero(access);
  }

  async removeHomeHero(access: AdminAccess, adminUserId: string, imageId: string) {
    await this.assertHeroCity(access, true);
    const rows = await this.db
      .delete(homeHeroImages)
      .where(and(eq(homeHeroImages.id, imageId), eq(homeHeroImages.city, "Hanoi")))
      .returning();
    const row = rows[0];
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy ảnh");
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "HOME_HERO_IMAGE_REMOVE",
      entityType: "home_hero_image",
      entityId: row.id,
      metadata: { contextId: row.contextId },
    });
    return { ok: true };
  }

  async listReviews(zoneId?: string) {
    const spotlights = await this.db
      .select({
        id: providerDailyUpdates.id,
        title: providerDailyUpdates.title,
        updateType: providerDailyUpdates.updateType,
        description: providerDailyUpdates.description,
        brandName: providers.brandName,
        offeringName: offerings.name,
        imageUrl: offerings.imageUrl,
        promoPriceVnd: providerDailyUpdates.promoPriceVnd,
        suggestedSurface: providerDailyUpdates.suggestedSurface,
        commerceModel: providers.commerceModel,
        categoryName: productCategories.name,
        createdAt: providerDailyUpdates.createdAt,
      })
      .from(providerDailyUpdates)
      .innerJoin(providerLocations, eq(providerLocations.id, providerDailyUpdates.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .leftJoin(offerings, eq(offerings.id, providerDailyUpdates.linkedEntityId))
      .leftJoin(productCategories, eq(productCategories.id, offerings.categoryId))
      .innerJoin(
        providerDailyUpdateZoneTargets,
        and(
          eq(providerDailyUpdateZoneTargets.updateId, providerDailyUpdates.id),
          eq(providerDailyUpdateZoneTargets.reviewStatus, "PENDING_REVIEW"),
          zoneId ? eq(providerDailyUpdateZoneTargets.zoneId, zoneId) : sql`true`,
        ),
      )
      .where(sql`${providerDailyUpdates.status} <> 'HIDDEN'`)
      .orderBy(desc(providerDailyUpdates.createdAt));
    return {
      spotlights: spotlights.map((row) => ({
        id: row.id,
        title: row.title,
        updateType: row.updateType,
        description: row.description,
        brandName: row.brandName,
        offeringName: row.offeringName,
        imageUrl: row.imageUrl,
        promoPriceVnd: row.promoPriceVnd,
        suggestedSurface: row.suggestedSurface,
        categoryName: row.categoryName,
        allowedSurfaces: surfacesForCommerce(row.commerceModel),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async setLocationOperations(
    access: AdminAccess,
    adminUserId: string,
    locationId: string,
    paused: boolean,
    zoneKey?: string,
  ) {
    const [row] = await this.db
      .select({
        id: providerLocations.id,
        status: providerLocations.status,
        displayName: providerLocations.displayName,
      })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy quán");
    const zoneId = await this.actingZoneForLocation(access, locationId, zoneKey);
    if (paused && row.status !== "ACTIVE") {
      throw new PickiError("CONFLICT", "Chỉ tạm dừng quán đang hoạt động");
    }
    if (!paused && row.status !== "PAUSED") {
      throw new PickiError("CONFLICT", "Quán không đang tạm dừng");
    }
    const status = paused ? "PAUSED" : "ACTIVE";
    await this.db
      .update(providerLocations)
      .set({ status, updatedAt: new Date() })
      .where(eq(providerLocations.id, locationId));
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: paused ? "LOCATION_PAUSE" : "LOCATION_RESUME",
      entityType: "provider_location",
      entityId: locationId,
      metadata: { displayName: row.displayName },
      zoneId,
    });
    return { status };
  }

  async reviewSpotlight(
    access: AdminAccess,
    adminUserId: string,
    updateId: string,
    approve: boolean,
    approvedSurface?: string,
    zoneKey?: string,
  ) {
    const [row] = await this.db
      .select({
        id: providerDailyUpdates.id,
        status: providerDailyUpdates.status,
        title: providerDailyUpdates.title,
        offeringId: providerDailyUpdates.linkedEntityId,
        locationId: providerDailyUpdates.providerLocationId,
        providerId: providerLocations.providerId,
        commerceModel: providers.commerceModel,
        promoPriceVnd: providerDailyUpdates.promoPriceVnd,
        suggestedSurface: providerDailyUpdates.suggestedSurface,
      })
      .from(providerDailyUpdates)
      .innerJoin(providerLocations, eq(providerLocations.id, providerDailyUpdates.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerDailyUpdates.id, updateId))
      .limit(1);
    if (!row || row.status === "HIDDEN") {
      throw new PickiError("CONFLICT", "Bài này không còn chờ duyệt");
    }
    const memberships = await this.locationZoneIds(row.locationId);
    const requested = zoneKey ? (await this.resolveZone(zoneKey)).id : null;
    if (requested && !memberships.includes(requested)) {
      throw new PickiError("NOT_FOUND", "Không thấy bài trong khu vực này");
    }
    const zoneIds = (requested ? [requested] : memberships).filter((zoneId) => canOperateZone(access, zoneId));
    if (zoneIds.length === 0) {
      throw new PickiError("FORBIDDEN", "Không có quyền duyệt bài ở khu này");
    }
    const zoneId = zoneIds[0]!;
    const allowed = surfacesForCommerce(row.commerceModel);
    const surface = approvedSurface ?? row.suggestedSurface;
    if (approve) {
      if (!row.offeringId) throw new PickiError("VALIDATION_ERROR", "Bài không gắn món");
      if (!surface || !isDiscoverySurface(surface) || !allowed.includes(surface)) {
        throw new PickiError("VALIDATION_ERROR", "Chọn mục trang chủ hợp lệ");
      }
      if (surface === "MARKET_TODAY") {
        const [used] = await this.db
          .select({ n: count() })
          .from(providerDailyUpdates)
          .innerJoin(providerLocations, eq(providerLocations.id, providerDailyUpdates.providerLocationId))
          .where(
            and(
              eq(providerLocations.providerId, row.providerId),
              eq(providerDailyUpdates.status, "ACTIVE"),
              eq(providerDailyUpdates.approvedSurface, "MARKET_TODAY"),
              sql`${providerDailyUpdates.expiresAt} > now()`,
            ),
          );
        if (Number(used?.n ?? 0) >= MARKET_FEATURED_QUOTA) {
          throw new PickiError(
            "CONFLICT",
            `Quán này đã đủ ${String(MARKET_FEATURED_QUOTA)} món Đi chợ hôm nay`,
          );
        }
      }
      if (row.promoPriceVnd != null) {
        const today = commerceServiceDate();
        await this.db
          .insert(productDailyAvailability)
          .values({
            providerId: row.providerId,
            providerLocationId: row.locationId,
            offeringId: row.offeringId,
            serviceDate: today,
            status: "AVAILABLE",
            priceOverrideVnd: row.promoPriceVnd,
          })
          .onConflictDoUpdate({
            target: [
              productDailyAvailability.providerLocationId,
              productDailyAvailability.offeringId,
              productDailyAvailability.serviceDate,
            ],
            set: { priceOverrideVnd: row.promoPriceVnd, updatedAt: new Date() },
          });
      }
      if (surface === "SPECIAL_TODAY") {
        const displaced = await this.db
          .select({ updateId: providerDailyUpdateZoneTargets.updateId })
          .from(providerDailyUpdateZoneTargets)
          .innerJoin(
            providerDailyUpdates,
            eq(providerDailyUpdates.id, providerDailyUpdateZoneTargets.updateId),
          )
          .where(
            and(
              eq(providerDailyUpdates.providerLocationId, row.locationId),
              ne(providerDailyUpdates.id, updateId),
              inArray(providerDailyUpdateZoneTargets.zoneId, zoneIds),
              eq(providerDailyUpdateZoneTargets.reviewStatus, "APPROVED"),
              eq(providerDailyUpdateZoneTargets.approvedSurface, "SPECIAL_TODAY"),
            ),
          );
        const displacedIds = [...new Set(displaced.map((item) => item.updateId))];
        if (displacedIds.length > 0) {
          await this.db
            .update(providerDailyUpdateZoneTargets)
            .set({ approvedSurface: null })
            .where(
              and(
                inArray(providerDailyUpdateZoneTargets.updateId, displacedIds),
                inArray(providerDailyUpdateZoneTargets.zoneId, zoneIds),
                eq(providerDailyUpdateZoneTargets.approvedSurface, "SPECIAL_TODAY"),
              ),
            );
          for (const displacedId of displacedIds) {
            const stillLive = await this.db
              .select({ id: providerDailyUpdateZoneTargets.id })
              .from(providerDailyUpdateZoneTargets)
              .where(
                and(
                  eq(providerDailyUpdateZoneTargets.updateId, displacedId),
                  eq(providerDailyUpdateZoneTargets.reviewStatus, "APPROVED"),
                  sql`${providerDailyUpdateZoneTargets.approvedSurface} IS NOT NULL`,
                ),
              )
              .limit(1);
            if (!stillLive[0]) {
              await this.db
                .update(providerDailyUpdates)
                .set({ status: "HIDDEN", updatedAt: new Date() })
                .where(eq(providerDailyUpdates.id, displacedId));
            }
          }
        }
      }
    }
    await applyLocalPostZoneReview(this.db, {
      updateId,
      zoneIds,
      approve,
      approvedSurface: approve && surface && isDiscoverySurface(surface) ? surface : null,
      reviewedBy: adminUserId,
    });
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: approve ? "SPOTLIGHT_APPROVE" : "SPOTLIGHT_REJECT",
      entityType: "provider_daily_update",
      entityId: updateId,
      metadata: {
        title: row.title,
        suggestedSurface: row.suggestedSurface,
        approvedSurface: approve ? surface : null,
      },
      zoneId,
    });
    return this.listReviews(zoneId);
  }

  async getZoneSettings(access: AdminAccess, zoneKey: string) {
    const zone = await this.resolveZone(zoneKey);
    this.assertReadZone(access, zone.id);
    const [fulfillment] = await this.db
      .select()
      .from(zoneFulfillmentSettings)
      .where(eq(zoneFulfillmentSettings.zoneId, zone.id))
      .limit(1);
    const [settings] = await this.db
      .select()
      .from(zoneSettings)
      .where(eq(zoneSettings.zoneId, zone.id))
      .limit(1);
    const notes =
      settings?.settings && typeof settings.settings === "object" && settings.settings !== null
        ? String((settings.settings as { notes?: unknown }).notes ?? "")
        : "";
    return {
      zone: { id: zone.id, slug: zone.slug, displayName: zone.displayName },
      notes,
      fulfillment: {
        batchWaitWindowMinutes: fulfillment?.batchWaitWindowMinutes ?? 5,
        maxBatchOrders: fulfillment?.maxBatchOrders ?? 3,
        maxRouteDetourMeters: fulfillment?.maxRouteDetourMeters ?? 500,
        foodDeliveryFeeVnd: fulfillment?.foodDeliveryFeeVnd ?? 15000,
        foodDoorDeliveryFeeVnd: fulfillment?.foodDoorDeliveryFeeVnd ?? 20000,
        laundryReturnRunnerFeeVnd: fulfillment?.laundryReturnRunnerFeeVnd ?? 15000,
        sameBuildingBaseFee: fulfillment?.sameBuildingBaseFee ?? 5000,
        buildingToBuildingBaseFee: fulfillment?.buildingToBuildingBaseFee ?? 10000,
        groundToBuildingBaseFee: fulfillment?.groundToBuildingBaseFee ?? 15000,
        buildingToGroundBaseFee: fulfillment?.buildingToGroundBaseFee ?? 15000,
        groundToGroundBaseFee: fulfillment?.groundToGroundBaseFee ?? 15000,
        minimumRunnerPayable: fulfillment?.minimumRunnerPayable ?? 0,
        hotFoodSurcharge: fulfillment?.hotFoodSurcharge ?? 0,
        heavySurcharge: fulfillment?.heavySurcharge ?? 0,
        bulkySurcharge: fulfillment?.bulkySurcharge ?? 0,
        batchExtraOrderFee: fulfillment?.batchExtraOrderFee ?? 2000,
      },
    };
  }

  async saveZoneSettings(
    access: AdminAccess,
    adminUserId: string,
    zoneKey: string,
    input: {
      notes: string;
      batchWaitWindowMinutes: number;
      maxBatchOrders: number;
      maxRouteDetourMeters: number;
      foodDeliveryFeeVnd: number;
      foodDoorDeliveryFeeVnd: number;
      laundryReturnRunnerFeeVnd: number;
      sameBuildingBaseFee: number;
      buildingToBuildingBaseFee: number;
      groundToBuildingBaseFee: number;
      buildingToGroundBaseFee: number;
      groundToGroundBaseFee: number;
      minimumRunnerPayable: number;
      hotFoodSurcharge: number;
      heavySurcharge: number;
      bulkySurcharge: number;
      batchExtraOrderFee: number;
    },
  ) {
    const zone = await this.resolveZone(zoneKey);
    this.assertConfigureZone(access, zone.id);
    const [existing] = await this.db
      .select()
      .from(zoneSettings)
      .where(eq(zoneSettings.zoneId, zone.id))
      .limit(1);
    const previous =
      existing?.settings && typeof existing.settings === "object" && existing.settings !== null
        ? (existing.settings as Record<string, unknown>)
        : {};
    await this.db
      .insert(zoneSettings)
      .values({ zoneId: zone.id, settings: { ...previous, notes: input.notes }, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: zoneSettings.zoneId,
        set: { settings: { ...previous, notes: input.notes }, updatedAt: new Date() },
      });
    const fees = {
      batchWaitWindowMinutes: input.batchWaitWindowMinutes,
      maxBatchOrders: input.maxBatchOrders,
      maxRouteDetourMeters: input.maxRouteDetourMeters,
      foodDeliveryFeeVnd: input.foodDeliveryFeeVnd,
      foodDoorDeliveryFeeVnd: input.foodDoorDeliveryFeeVnd,
      laundryReturnRunnerFeeVnd: input.laundryReturnRunnerFeeVnd,
      sameBuildingBaseFee: input.sameBuildingBaseFee,
      buildingToBuildingBaseFee: input.buildingToBuildingBaseFee,
      groundToBuildingBaseFee: input.groundToBuildingBaseFee,
      buildingToGroundBaseFee: input.buildingToGroundBaseFee,
      groundToGroundBaseFee: input.groundToGroundBaseFee,
      minimumRunnerPayable: input.minimumRunnerPayable,
      hotFoodSurcharge: input.hotFoodSurcharge,
      heavySurcharge: input.heavySurcharge,
      bulkySurcharge: input.bulkySurcharge,
      batchExtraOrderFee: input.batchExtraOrderFee,
      updatedAt: new Date(),
    };
    await this.db
      .insert(zoneFulfillmentSettings)
      .values({ zoneId: zone.id, ...fees })
      .onConflictDoUpdate({ target: zoneFulfillmentSettings.zoneId, set: fees });
    await this.db.insert(auditLogs).values({
      actorUserId: adminUserId,
      action: "ZONE_SETTINGS_UPDATE",
      entityType: "zone",
      entityId: zone.id,
      zoneId: zone.id,
      metadata: { notes: input.notes },
    });
    return this.getZoneSettings(access, zone.slug);
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

function blankText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text.length > 0 ? text : null;
}

function toZonePlaceDto(row: typeof zonePlaces.$inferSelect) {
  return {
    id: row.id,
    kind: row.kind as
      | "BUILDING"
      | "AREA"
      | "TRADITIONAL_MARKET"
      | "RESIDENTIAL_PODIUM_CLUSTER"
      | "GROUND_STREET_CLUSTER",
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
    doorSurcharge: row.doorSurcharge,
    slowElevatorSurcharge: row.slowElevatorSurcharge,
    elevatorWaitMinutes: row.elevatorWaitMinutes,
    anchorCode: row.anchorCode,
    notes: row.notes,
    status: row.status,
  };
}
