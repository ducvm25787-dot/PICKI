import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setDailySellableQty } from "../commerce/stock.js";
import { createPickiDb } from "../client.js";
import { offerings, offeringPrices, productDailyAvailability } from "../schema/catalog.js";
import { experienceCities } from "../schema/experiences.js";
import { users } from "../schema/identity.js";
import { orders } from "../schema/orders.js";
import { providerMembers } from "../schema/provider-ops.js";
import { providerLocations, providerZoneMemberships, providers } from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import { chainOrders, chainOverview, chainProductLocations, chainProducts, loadChainViewer } from "./chain-console.js";
import { userCoversLocation } from "./member-access.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("chain console queries", () => {
  const { db, sql } = createPickiDb(databaseUrl);
  const stamp = Date.now();
  const serviceDate = "2026-10-04";
  let hanoiId = "";
  let southCode = "";
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
  let customerId = "";

  beforeAll(async () => {
    const [hanoi] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, "Hanoi")).limit(1);
    hanoiId = hanoi!.id;
    southCode = `ChainSouth${stamp}`;
    await db.insert(experienceCities).values({ code: southCode, label: "Miền khác", slug: `chain-south-${stamp}`, enabled: false });
    const [south] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, southCode)).limit(1);
    const insertedZones = await db.insert(zones).values([
      { slug: `chain-kv-${stamp}`, name: "Kim Văn", displayName: "Kim Văn", cityId: hanoiId, anchorLng: 105.8, anchorLat: 20.97 },
      { slug: `chain-dk-${stamp}`, name: "Đại Kim", displayName: "Đại Kim", cityId: hanoiId, anchorLng: 105.81, anchorLat: 20.97 },
      { slug: `chain-ld-${stamp}`, name: "Linh Đàm", displayName: "Linh Đàm", cityId: hanoiId, anchorLng: 105.82, anchorLat: 20.97 },
      { slug: `chain-eco-${stamp}`, name: "Eco", displayName: "Eco", cityId: south!.id, anchorLng: 106.7, anchorLat: 10.8 },
    ]).returning();
    kimVan = insertedZones[0]!.id;
    daiKim = insertedZones[1]!.id;
    linhDam = insertedZones[2]!.id;
    ecoZone = insertedZones[3]!.id;
    const insertedProviders = await db.insert(providers).values([
      { slug: `chain-a-${stamp}`, brandName: "Demo Chain", providerType: "FOOD_STALL", commerceModel: "FOOD_SERVICE", status: "DRAFT" },
      { slug: `chain-b-${stamp}`, brandName: "Quán khác", providerType: "FOOD_STALL", commerceModel: "FOOD_SERVICE", status: "DRAFT" },
    ]).returning();
    providerA = insertedProviders[0]!.id;
    providerB = insertedProviders[1]!.id;
    const insertedLocations = await db.insert(providerLocations).values([
      { providerId: providerA, slug: `ct12-${stamp}`, displayName: "CT12", status: "ACTIVE" },
      { providerId: providerA, slug: `hh1-${stamp}`, displayName: "HH1", status: "ACTIVE" },
      { providerId: providerA, slug: `eco-${stamp}`, displayName: "EcoGreen", status: "ACTIVE" },
      { providerId: providerB, slug: `other-${stamp}`, displayName: "Quán khác", status: "ACTIVE" },
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
    const people = await db.insert(users).values([
      { displayName: "HQ" },
      { displayName: "Hà Nội" },
      { displayName: "Kim Văn" },
      { displayName: "CT12" },
      { displayName: "Khách" },
    ]).returning();
    hq = people[0]!.id;
    cityUser = people[1]!.id;
    zoneUser = people[2]!.id;
    locationUser = people[3]!.id;
    customerId = people[4]!.id;
    await db.insert(providerMembers).values([
      { userId: hq, providerId: providerA, role: "OWNER", scopeType: "PROVIDER", scopeId: providerA },
      { userId: cityUser, providerId: providerA, role: "MANAGER", scopeType: "CITY", scopeId: hanoiId },
      { userId: zoneUser, providerId: providerA, role: "MANAGER", scopeType: "ZONE", scopeId: kimVan },
      { userId: locationUser, providerId: providerA, role: "STAFF", scopeType: "LOCATION", scopeId: ct12 },
    ]);
    const [offering] = await db.insert(offerings).values({ providerId: providerA, slug: `sua-${stamp}`, name: "Sữa tươi 180ml" }).returning();
    offeringId = offering!.id;
    await db.insert(offeringPrices).values([
      { offeringId, providerLocationId: ct12, amountVnd: 7000 },
      { offeringId, providerLocationId: hh1, amountVnd: 7000 },
      { offeringId, providerLocationId: eco, amountVnd: 7500 },
    ]);
    await db.insert(productDailyAvailability).values([
      { providerId: providerA, providerLocationId: ct12, offeringId, serviceDate, status: "AVAILABLE", availableQty: 24 },
      { providerId: providerA, providerLocationId: hh1, offeringId, serviceDate, status: "SOLD_OUT", availableQty: 0 },
      { providerId: providerA, providerLocationId: eco, offeringId, serviceDate, status: "AVAILABLE", availableQty: 18 },
    ]);
    await db.insert(orders).values([
      { orderNumber: `dc-kv-${stamp}`, customerUserId: customerId, zoneId: kimVan, providerLocationId: ct12, subtotalVnd: 7000, totalVnd: 7000, status: "CREATED" },
      { orderNumber: `dc-dk-${stamp}`, customerUserId: customerId, zoneId: daiKim, providerLocationId: ct12, subtotalVnd: 7000, totalVnd: 7000, status: "CREATED" },
      { orderNumber: `dc-eco-${stamp}`, customerUserId: customerId, zoneId: ecoZone, providerLocationId: eco, subtotalVnd: 7500, totalVnd: 7500, status: "CREATED" },
    ]);
  });

  afterAll(async () => {
    if (providerA) await db.delete(orders).where(eq(orders.providerLocationId, ct12));
    if (eco) await db.delete(orders).where(eq(orders.providerLocationId, eco));
    if (providerA) await db.delete(providers).where(eq(providers.id, providerA));
    if (providerB) await db.delete(providers).where(eq(providers.id, providerB));
    for (const id of [kimVan, daiKim, linhDam, ecoZone]) {
      if (id) await db.delete(zones).where(eq(zones.id, id));
    }
    for (const id of [hq, cityUser, zoneUser, locationUser, customerId]) {
      if (id) await db.delete(users).where(eq(users.id, id));
    }
    if (southCode) await db.delete(experienceCities).where(eq(experienceCities.code, southCode));
    await sql.end({ timeout: 5 });
  });

  it("scopes HQ, Hanoi, Kim Văn, and CT12 without the other provider", async () => {
    const hqView = await loadChainViewer(db, hq);
    const hanoiView = await loadChainViewer(db, cityUser);
    const zoneView = await loadChainViewer(db, zoneUser);
    const localView = await loadChainViewer(db, locationUser);
    expect(hqView.chainEnabled).toBe(true);
    expect(hqView.locations.filter((location) => location.providerId === providerA)).toHaveLength(3);
    expect(hqView.locations.some((location) => location.id === otherLoc)).toBe(false);
    expect(hanoiView.chainEnabled).toBe(true);
    expect(hanoiView.scopes.find((scope) => scope.scopeType === "CITY")?.scopeId).toBe(hanoiId);
    const hanoi = hanoiView.scopes.find((scope) => scope.scopeType === "CITY")!;
    const hanoiRows = (await chainOverview(db, hanoiView.locations.filter((location) => location.cityLabel === "Hà Nội" || location.zones.some((zone) => zone.cityId === hanoiId)), hanoi, new Date("2026-10-04T10:00:00+07:00"))).locationCount;
    expect(hanoiRows).toBe(2);
    expect(zoneView.scopes.map((scope) => scope.scopeId).sort()).toEqual([ct12, kimVan].sort());
    expect(localView.chainEnabled).toBe(false);
    expect(await userCoversLocation(db, cityUser, eco)).toBe(false);
    expect(await userCoversLocation(db, zoneUser, otherLoc)).toBe(false);
    expect(await userCoversLocation(db, hq, otherLoc)).toBe(false);
  });

  it("keeps one offering, separate prices, and zone-owned orders", async () => {
    const hqView = await loadChainViewer(db, hq);
    const products = await chainProducts(db, hqView.locations, new Date("2026-10-04T10:00:00+07:00"));
    expect(products.filter((row) => row.name === "Sữa tươi 180ml")).toHaveLength(1);
    const detail = await chainProductLocations(db, hqView.locations, offeringId, new Date("2026-10-04T10:00:00+07:00"));
    expect(detail.find((row) => row.locationId === ct12)).toMatchObject({ priceVnd: 7000, availableQty: 24, status: "AVAILABLE" });
    expect(detail.find((row) => row.locationId === hh1)).toMatchObject({ priceVnd: 7000, availableQty: 0, status: "SOLD_OUT" });
    expect(detail.find((row) => row.locationId === eco)).toMatchObject({ priceVnd: 7500, availableQty: 18 });

    await db.transaction((tx) => setDailySellableQty(tx, { providerLocationId: ct12, offeringId, serviceDate, quantity: 11 }));
    const [hh] = await db.select({ qty: productDailyAvailability.availableQty }).from(productDailyAvailability).where(eq(productDailyAvailability.providerLocationId, hh1));
    expect(hh?.qty).toBe(0);

    const zoneView = await loadChainViewer(db, zoneUser);
    const zoneScope = zoneView.scopes.find((scope) => scope.scopeType === "ZONE")!;
    const zoneOrders = await chainOrders(db, zoneView.locations.filter((location) => location.zones.some((zone) => zone.id === kimVan)), zoneScope, { range: "7d" }, new Date("2026-10-04T10:00:00+07:00"));
    expect(zoneOrders.map((row) => row.orderNumber)).toContain(`dc-kv-${stamp}`);
    expect(zoneOrders.map((row) => row.orderNumber)).not.toContain(`dc-dk-${stamp}`);
    expect(zoneOrders.map((row) => row.orderNumber)).not.toContain(`dc-eco-${stamp}`);
  });
});
