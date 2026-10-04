import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { commerceToday } from "./chain-console.js";
import { offerings, offeringPrices, productDailyAvailability } from "../schema/catalog.js";
import { experienceCities } from "../schema/experiences.js";
import { providerDailyUpdateZoneTargets } from "../schema/habit.js";
import { users } from "../schema/identity.js";
import { auditLogs } from "../schema/infrastructure.js";
import { orderCampaignAttributions, providerCampaigns } from "../schema/campaigns.js";
import { orders } from "../schema/orders.js";
import { providerMembers } from "../schema/provider-ops.js";
import { providerLocations, providerZoneMemberships, providers } from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import { listCampaignHomeCards } from "./campaign-home.js";
import {
  approveProviderCampaign,
  createProviderCampaign,
  editProviderCampaign,
  recordOrderCampaignAttributions,
  submitProviderCampaign,
  suppressProviderCampaign,
  unsuppressProviderCampaign,
} from "./campaign-store.js";
import { campaignAttributionRows } from "./campaign-rules.js";
import type { ChainLocation } from "./chain-scope.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("chain campaign store", () => {
  const { db, sql } = createPickiDb(databaseUrl);
  const stamp = Date.now();
  let hanoiId = "";
  let southId = "";
  let kimVan = "";
  let daiKim = "";
  let linhDam = "";
  let ecoZone = "";
  let providerA = "";
  let providerB = "";
  let ct12 = "";
  let hh1 = "";
  let eco = "";
  let otherLoc = "";
  let offeringId = "";
  let hq = "";
  let cityUser = "";
  let zoneUser = "";
  let locationUser = "";
  let approver = "";
  let customerId = "";
  let chainLocations: ChainLocation[] = [];

  beforeAll(async () => {
    const [hanoi] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, "Hanoi")).limit(1);
    hanoiId = hanoi!.id;
    const southCode = `CampSouth${stamp}`;
    await db.insert(experienceCities).values({ code: southCode, label: "Miền campaign", slug: `camp-south-${stamp}`, enabled: false });
    const [south] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, southCode)).limit(1);
    southId = south!.id;
    const insertedZones = await db.insert(zones).values([
      { slug: `camp-kv-${stamp}`, name: "Kim Văn", displayName: "Kim Văn", cityId: hanoiId, anchorLng: 105.8, anchorLat: 20.97 },
      { slug: `camp-dk-${stamp}`, name: "Đại Kim", displayName: "Đại Kim", cityId: hanoiId, anchorLng: 105.81, anchorLat: 20.97 },
      { slug: `camp-ld-${stamp}`, name: "Linh Đàm", displayName: "Linh Đàm", cityId: hanoiId, anchorLng: 105.82, anchorLat: 20.97 },
      { slug: `camp-eco-${stamp}`, name: "Eco", displayName: "Eco", cityId: southId, anchorLng: 106.7, anchorLat: 10.8 },
    ]).returning();
    kimVan = insertedZones[0]!.id;
    daiKim = insertedZones[1]!.id;
    linhDam = insertedZones[2]!.id;
    ecoZone = insertedZones[3]!.id;
    const insertedProviders = await db.insert(providers).values([
      { slug: `camp-a-${stamp}`, brandName: "Demo Chain", providerType: "FOOD_STALL", commerceModel: "FOOD_SERVICE", status: "ACTIVE" },
      { slug: `camp-b-${stamp}`, brandName: "Quán khác", providerType: "FOOD_STALL", commerceModel: "FOOD_SERVICE", status: "ACTIVE" },
    ]).returning();
    providerA = insertedProviders[0]!.id;
    providerB = insertedProviders[1]!.id;
    const insertedLocations = await db.insert(providerLocations).values([
      { providerId: providerA, slug: `camp-ct12-${stamp}`, displayName: "CT12", status: "ACTIVE" },
      { providerId: providerA, slug: `camp-hh1-${stamp}`, displayName: "HH1", status: "ACTIVE" },
      { providerId: providerA, slug: `camp-eco-${stamp}`, displayName: "EcoGreen", status: "ACTIVE" },
      { providerId: providerB, slug: `camp-other-${stamp}`, displayName: "Quán khác", status: "ACTIVE" },
    ]).returning();
    ct12 = insertedLocations[0]!.id;
    hh1 = insertedLocations[1]!.id;
    eco = insertedLocations[2]!.id;
    otherLoc = insertedLocations[3]!.id;
    await db.insert(providerZoneMemberships).values([
      { providerLocationId: ct12, zoneId: kimVan, status: "ACTIVE" },
      { providerLocationId: ct12, zoneId: daiKim, status: "ACTIVE" },
      { providerLocationId: hh1, zoneId: linhDam, status: "ACTIVE" },
      { providerLocationId: eco, zoneId: ecoZone, status: "ACTIVE" },
      { providerLocationId: otherLoc, zoneId: kimVan, status: "ACTIVE" },
    ]);
    chainLocations = [
      { id: ct12, providerId: providerA, zones: [{ id: kimVan, cityId: hanoiId }, { id: daiKim, cityId: hanoiId }] },
      { id: hh1, providerId: providerA, zones: [{ id: linhDam, cityId: hanoiId }] },
      { id: eco, providerId: providerA, zones: [{ id: ecoZone, cityId: southId }] },
      { id: otherLoc, providerId: providerB, zones: [{ id: kimVan, cityId: hanoiId }] },
    ];
    const people = await db.insert(users).values([
      { displayName: "HQ" },
      { displayName: "Hà Nội" },
      { displayName: "Kim Văn" },
      { displayName: "CT12" },
      { displayName: "Super" },
      { displayName: "Khách" },
    ]).returning();
    hq = people[0]!.id;
    cityUser = people[1]!.id;
    zoneUser = people[2]!.id;
    locationUser = people[3]!.id;
    approver = people[4]!.id;
    customerId = people[5]!.id;
    await db.insert(providerMembers).values([
      { userId: hq, providerId: providerA, role: "OWNER", scopeType: "PROVIDER", scopeId: providerA },
      { userId: cityUser, providerId: providerA, role: "MANAGER", scopeType: "CITY", scopeId: hanoiId },
      { userId: zoneUser, providerId: providerA, role: "MANAGER", scopeType: "ZONE", scopeId: kimVan },
      { userId: locationUser, providerId: providerA, role: "STAFF", scopeType: "LOCATION", scopeId: ct12 },
    ]);
    const [offering] = await db.insert(offerings).values({ providerId: providerA, slug: `camp-sua-${stamp}`, name: "Sữa tươi 180ml" }).returning();
    offeringId = offering!.id;
    await db.insert(offeringPrices).values([
      { offeringId, providerLocationId: ct12, amountVnd: 7000 },
      { offeringId, providerLocationId: hh1, amountVnd: 7000 },
    ]);
    const serviceDate = commerceToday();
    await db.insert(productDailyAvailability).values([
      { providerId: providerA, providerLocationId: ct12, offeringId, serviceDate, status: "AVAILABLE", availableQty: 0 },
      { providerId: providerA, providerLocationId: hh1, offeringId, serviceDate, status: "AVAILABLE", availableQty: 12 },
    ]);
  });

  afterAll(async () => {
    const locationIds = [ct12, hh1, eco, otherLoc].filter(Boolean);
    if (locationIds.length) await db.delete(orders).where(inArray(orders.providerLocationId, locationIds));
    if (providerA) await db.delete(providerCampaigns).where(eq(providerCampaigns.providerId, providerA));
    if (providerA) await db.delete(providers).where(eq(providers.id, providerA));
    if (providerB) await db.delete(providers).where(eq(providers.id, providerB));
    const userIds = [hq, cityUser, zoneUser, locationUser, approver, customerId].filter(Boolean);
    if (userIds.length) await db.delete(auditLogs).where(inArray(auditLogs.actorUserId, userIds));
    const zoneIds = [kimVan, daiKim, linhDam, ecoZone].filter(Boolean);
    if (zoneIds.length) await db.delete(auditLogs).where(inArray(auditLogs.zoneId, zoneIds));
    if (zoneIds.length) await db.delete(zones).where(inArray(zones.id, zoneIds));
    if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
    if (southId) await db.delete(experienceCities).where(eq(experienceCities.id, southId));
    await sql.end();
  });

  it("distributes an approved city campaign without a second zone review", async () => {
    const grants = {
      hq: [{ providerId: providerA, role: "OWNER", scopeType: "PROVIDER", scopeId: providerA }],
      city: [{ providerId: providerA, role: "MANAGER", scopeType: "CITY", scopeId: hanoiId }],
      zone: [{ providerId: providerA, role: "MANAGER", scopeType: "ZONE", scopeId: kimVan }],
      staff: [{ providerId: providerA, role: "STAFF", scopeType: "LOCATION", scopeId: ct12 }],
    };
    const base = { locations: chainLocations, providerLocationCount: 3, providerId: providerA };
    const created = await createProviderCampaign(db, {
      ...base,
      actorUserId: cityUser,
      grants: grants.city,
      name: "Sữa Hà Nội",
      campaignType: "PRICE_PROMOTION",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
      targets: [{ targetType: "CITY", targetId: hanoiId }],
      items: [{ offeringId, discountPercent: 10 }],
    });
    await expect(createProviderCampaign(db, {
      ...base,
      actorUserId: locationUser,
      grants: grants.staff,
      name: "Local",
      campaignType: "HERO_PRODUCT",
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 86_400_000),
      targets: [{ targetType: "LOCATION", targetId: ct12 }],
      items: [{ offeringId }],
    })).rejects.toThrow(/không tạo/);
    const before = await db.select().from(providerDailyUpdateZoneTargets).where(eq(providerDailyUpdateZoneTargets.zoneId, kimVan));
    await submitProviderCampaign(db, { actorUserId: cityUser, providerId: providerA, campaignId: created.id, grants: grants.city, providerLocationCount: 3 });
    expect(await listCampaignHomeCards(sql, kimVan)).toHaveLength(0);
    await approveProviderCampaign(db, { actorUserId: approver, campaignId: created.id });
    const after = await db.select().from(providerDailyUpdateZoneTargets).where(eq(providerDailyUpdateZoneTargets.zoneId, kimVan));
    expect(after).toHaveLength(before.length);
    const kimVanCards = await listCampaignHomeCards(sql, kimVan);
    const linhDamCards = await listCampaignHomeCards(sql, linhDam);
    expect(kimVanCards).toHaveLength(0);
    expect(linhDamCards.map((card) => card.location_id)).toEqual([hh1]);
    expect(linhDamCards[0]?.brand_name).toBe("Demo Chain");
    expect(linhDamCards[0]?.location_name).toBe("HH1");
    await suppressProviderCampaign(db, { actorUserId: zoneUser, campaignId: created.id, zoneId: kimVan, reason: "Tạm ẩn Kim Văn" });
    expect(await listCampaignHomeCards(sql, linhDam)).toHaveLength(1);
    await db.update(productDailyAvailability).set({ availableQty: 8 }).where(eq(productDailyAvailability.providerLocationId, ct12));
    expect((await listCampaignHomeCards(sql, kimVan)).map((card) => card.location_id)).toEqual([]);
    await unsuppressProviderCampaign(db, { actorUserId: zoneUser, campaignId: created.id, zoneId: kimVan });
    expect((await listCampaignHomeCards(sql, kimVan)).map((card) => card.location_id)).toEqual([ct12]);
    await editProviderCampaign(db, {
      actorUserId: cityUser,
      providerId: providerA,
      campaignId: created.id,
      grants: grants.city,
      locations: chainLocations,
      providerLocationCount: 3,
      name: "Sữa Hà Nội sửa",
    });
    expect(await listCampaignHomeCards(sql, linhDam)).toHaveLength(0);
    const [saved] = await db.select().from(providerCampaigns).where(eq(providerCampaigns.id, created.id)).limit(1);
    expect(saved?.status).toBe("DRAFT");
    expect(saved?.approvalStatus).toBe("NONE");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, created.id));
    expect(logs.some((log) => log.action === "campaign.approved" && log.zoneId == null)).toBe(true);
    expect(logs.some((log) => log.action === "campaign.suppressed" && log.zoneId === kimVan)).toBe(true);
    const [order] = await db.insert(orders).values({
      orderNumber: `camp-${stamp}`,
      customerUserId: customerId,
      zoneId: linhDam,
      providerLocationId: hh1,
      subtotalVnd: 7000,
      totalVnd: 7000,
      status: "CREATED",
    }).returning();
    await recordOrderCampaignAttributions(db, campaignAttributionRows({
      orderId: order!.id,
      locationId: hh1,
      campaigns: [
        { campaignId: created.id, offeringId, kind: "PRICE_PROMOTION", campaignPrice: null, discountAmount: null, discountPercent: 10 },
        { campaignId: created.id, offeringId, kind: "DELIVERY_SUBSIDY", campaignPrice: null, discountAmount: 1000, discountPercent: null },
      ],
    }));
    const attributed = await db.select().from(orderCampaignAttributions).where(eq(orderCampaignAttributions.orderId, order!.id));
    expect(attributed).toHaveLength(2);
    expect(grants.hq[0]?.scopeType).toBe("PROVIDER");
    expect(grants.zone[0]?.scopeId).toBe(kimVan);
  });
});
