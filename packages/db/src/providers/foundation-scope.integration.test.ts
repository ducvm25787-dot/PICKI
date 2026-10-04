import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listLocationMenu } from "../catalog/queries.js";
import { setDailySellableQty } from "../commerce/stock.js";
import { createPickiDb } from "../client.js";
import { listApprovedHomeSurface } from "../habit/queries.js";
import { applyLocalPostZoneReview } from "../habit/zone-review.js";
import { migrate } from "../migrator.js";
import { offerings, offeringPrices, productDailyAvailability } from "../schema/catalog.js";
import { experienceCities } from "../schema/experiences.js";
import { providerDailyUpdates, providerDailyUpdateZoneTargets } from "../schema/habit.js";
import { users } from "../schema/identity.js";
import { providerMembers } from "../schema/provider-ops.js";
import { providerLocations, providerZoneMemberships, providers } from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import { locationsCoveredByUser, userCoversLocation } from "./member-access.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("provider foundation scope", () => {
  const { db, sql: raw } = createPickiDb(databaseUrl);
  const stamp = Date.now();
  const serviceDate = "2026-10-04";
  let hanoiId = "";
  let otherCityCode = "";
  let zoneA = "";
  let zoneB = "";
  let zoneOther = "";
  let providerA = "";
  let providerB = "";
  let sharedLocation = "";
  let onlyA = "";
  let onlyB = "";
  let otherCityLocation = "";
  let otherProviderLocation = "";
  let offeringId = "";
  let updateId = "";
  let zoneStaff = "";
  let cityStaff = "";

  beforeAll(async () => {
    await migrate({ databaseUrl });
    const [hanoi] = await db
      .select({ id: experienceCities.id })
      .from(experienceCities)
      .where(eq(experienceCities.code, "Hanoi"))
      .limit(1);
    hanoiId = hanoi!.id;
    otherCityCode = `P1R${stamp}`;
    await db.insert(experienceCities).values({
      code: otherCityCode,
      label: "Thành phố thử",
      slug: `p1r-${stamp}`,
      enabled: false,
    });
    const [otherCity] = await db
      .select({ id: experienceCities.id })
      .from(experienceCities)
      .where(eq(experienceCities.code, otherCityCode))
      .limit(1);

    const insertedZones = await db
      .insert(zones)
      .values([
        { slug: `p1r-a-${stamp}`, name: "A", displayName: "A", cityId: hanoiId, anchorLng: 105.8, anchorLat: 20.9 },
        { slug: `p1r-b-${stamp}`, name: "B", displayName: "B", cityId: hanoiId, anchorLng: 105.9, anchorLat: 20.9 },
        {
          slug: `p1r-c-${stamp}`,
          name: "C",
          displayName: "C",
          cityId: otherCity!.id,
          anchorLng: 106.7,
          anchorLat: 10.8,
        },
      ])
      .returning();
    zoneA = insertedZones[0]!.id;
    zoneB = insertedZones[1]!.id;
    zoneOther = insertedZones[2]!.id;

    const insertedProviders = await db
      .insert(providers)
      .values([
        {
          slug: `p1r-a-${stamp}`,
          brandName: "Chuỗi A",
          providerType: "FOOD_STALL",
          commerceModel: "FOOD_SERVICE",
          status: "ACTIVE",
        },
        {
          slug: `p1r-b-${stamp}`,
          brandName: "Chuỗi B",
          providerType: "FOOD_STALL",
          commerceModel: "FOOD_SERVICE",
          status: "ACTIVE",
        },
      ])
      .returning();
    providerA = insertedProviders[0]!.id;
    providerB = insertedProviders[1]!.id;

    const insertedLocations = await db
      .insert(providerLocations)
      .values([
        { providerId: providerA, slug: `p1r-shared-${stamp}`, displayName: "Điểm hai khu", status: "ACTIVE" },
        { providerId: providerA, slug: `p1r-only-a-${stamp}`, displayName: "Chỉ khu A", status: "ACTIVE" },
        { providerId: providerA, slug: `p1r-only-b-${stamp}`, displayName: "Chỉ khu B", status: "ACTIVE" },
        { providerId: providerA, slug: `p1r-other-${stamp}`, displayName: "Thành phố khác", status: "ACTIVE" },
        { providerId: providerB, slug: `p1r-other-brand-${stamp}`, displayName: "Hãng khác", status: "ACTIVE" },
      ])
      .returning();
    sharedLocation = insertedLocations[0]!.id;
    onlyA = insertedLocations[1]!.id;
    onlyB = insertedLocations[2]!.id;
    otherCityLocation = insertedLocations[3]!.id;
    otherProviderLocation = insertedLocations[4]!.id;

    await db.insert(providerZoneMemberships).values([
      { providerLocationId: sharedLocation, zoneId: zoneA, status: "ACTIVE" },
      { providerLocationId: sharedLocation, zoneId: zoneB, status: "ACTIVE" },
      { providerLocationId: onlyA, zoneId: zoneA, status: "ACTIVE" },
      { providerLocationId: onlyB, zoneId: zoneB, status: "ACTIVE" },
      { providerLocationId: otherCityLocation, zoneId: zoneOther, status: "ACTIVE" },
      { providerLocationId: otherProviderLocation, zoneId: zoneA, status: "ACTIVE" },
    ]);

    const [staffA] = await db.insert(users).values({ displayName: `zone-${stamp}` }).returning();
    const [staffCity] = await db.insert(users).values({ displayName: `city-${stamp}` }).returning();
    zoneStaff = staffA!.id;
    cityStaff = staffCity!.id;
    await db.insert(providerMembers).values([
      {
        userId: zoneStaff,
        providerId: providerA,
        role: "MANAGER",
        scopeType: "ZONE",
        scopeId: zoneA,
      },
      {
        userId: cityStaff,
        providerId: providerA,
        role: "MANAGER",
        scopeType: "CITY",
        scopeId: hanoiId,
      },
    ]);

    const [offering] = await db
      .insert(offerings)
      .values({ providerId: providerA, slug: `p1r-dish-${stamp}`, name: "Món thử" })
      .returning();
    offeringId = offering!.id;
    await db.insert(offeringPrices).values({
      offeringId,
      providerLocationId: sharedLocation,
      amountVnd: 25000,
    });
    await db.transaction((tx) =>
      setDailySellableQty(tx, {
        providerLocationId: sharedLocation,
        offeringId,
        serviceDate,
        quantity: 7,
      }),
    );

    const [update] = await db
      .insert(providerDailyUpdates)
      .values({
        providerLocationId: sharedLocation,
        updateType: "DAILY_SPECIAL",
        title: "Món thử hai khu",
        linkedEntityType: "OFFERING",
        linkedEntityId: offeringId,
        suggestedSurface: "SNACK_DESSERT",
        validFrom: new Date("2026-10-04T00:00:00+07:00"),
        expiresAt: new Date("2026-10-05T23:59:00+07:00"),
        status: "PENDING_REVIEW",
        createdBy: zoneStaff,
      })
      .returning();
    updateId = update!.id;
    await db.insert(providerDailyUpdateZoneTargets).values([
      { updateId, zoneId: zoneA, reviewStatus: "PENDING_REVIEW" },
      { updateId, zoneId: zoneB, reviewStatus: "PENDING_REVIEW" },
    ]);
  });

  afterAll(async () => {
    if (updateId) await db.delete(providerDailyUpdates).where(eq(providerDailyUpdates.id, updateId));
    if (providerA) await db.delete(providers).where(eq(providers.id, providerA));
    if (providerB) await db.delete(providers).where(eq(providers.id, providerB));
    if (zoneA) await db.delete(zones).where(eq(zones.id, zoneA));
    if (zoneB) await db.delete(zones).where(eq(zones.id, zoneB));
    if (zoneOther) await db.delete(zones).where(eq(zones.id, zoneOther));
    if (zoneStaff) await db.delete(users).where(eq(users.id, zoneStaff));
    if (cityStaff) await db.delete(users).where(eq(users.id, cityStaff));
    if (otherCityCode) await db.delete(experienceCities).where(eq(experienceCities.code, otherCityCode));
    await raw.end({ timeout: 5 });
  });

  it("keeps one stock row when a location serves two zones in the same city", async () => {
    const rows = await db
      .select({
        id: productDailyAvailability.id,
        qty: productDailyAvailability.availableQty,
      })
      .from(productDailyAvailability)
      .where(eq(productDailyAvailability.providerLocationId, sharedLocation));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.qty).toBe(7);

    const [joined] = await raw<{ stock_rows: number; summed_qty: number }[]>`
      SELECT count(DISTINCT day.id)::int AS stock_rows,
             coalesce(sum(DISTINCT day.available_qty), 0)::int AS summed_qty
      FROM product_daily_availability day
      JOIN provider_zone_memberships m
        ON m.provider_location_id = day.provider_location_id
       AND m.status = 'ACTIVE'
      WHERE day.provider_location_id = ${sharedLocation}::uuid
    `;
    expect(joined?.stock_rows).toBe(1);
    expect(joined?.summed_qty).toBe(7);

    const menu = await listLocationMenu(raw, sharedLocation, serviceDate);
    const dish = menu.filter((row) => row.offering_id === offeringId);
    expect(dish).toHaveLength(1);
    expect(dish[0]?.available_qty).toBe(7);
  });

  it("approves zone A without changing zone B", async () => {
    await applyLocalPostZoneReview(db, {
      updateId,
      zoneIds: [zoneA],
      approve: true,
      approvedSurface: "SNACK_DESSERT",
      reviewedBy: zoneStaff,
    });

    const targets = await db
      .select({
        zoneId: providerDailyUpdateZoneTargets.zoneId,
        reviewStatus: providerDailyUpdateZoneTargets.reviewStatus,
        approvedSurface: providerDailyUpdateZoneTargets.approvedSurface,
      })
      .from(providerDailyUpdateZoneTargets)
      .where(eq(providerDailyUpdateZoneTargets.updateId, updateId));
    const targetA = targets.find((row) => row.zoneId === zoneA);
    const targetB = targets.find((row) => row.zoneId === zoneB);
    expect(targetA).toMatchObject({ reviewStatus: "APPROVED", approvedSurface: "SNACK_DESSERT" });
    expect(targetB).toMatchObject({ reviewStatus: "PENDING_REVIEW", approvedSurface: null });

    const homeA = await listApprovedHomeSurface(raw, zoneA, "SNACK_DESSERT");
    const homeB = await listApprovedHomeSurface(raw, zoneB, "SNACK_DESSERT");
    expect(homeA.some((row) => row.title === "Món thử")).toBe(true);
    expect(homeB.some((row) => row.title === "Món thử")).toBe(false);
  });

  it("lets a zone manager handle only that provider's locations in the zone", async () => {
    const covered = await locationsCoveredByUser(db, zoneStaff);
    expect(covered.map((row) => row.locationId).sort()).toEqual([sharedLocation, onlyA].sort());
    expect(await userCoversLocation(db, zoneStaff, onlyB)).toBe(false);
    expect(await userCoversLocation(db, zoneStaff, otherProviderLocation)).toBe(false);
    expect(await userCoversLocation(db, zoneStaff, otherCityLocation)).toBe(false);
  });

  it("lets a city manager see only that provider's locations in the city", async () => {
    const covered = await locationsCoveredByUser(db, cityStaff);
    expect(covered.map((row) => row.locationId).sort()).toEqual([sharedLocation, onlyA, onlyB].sort());
    expect(await userCoversLocation(db, cityStaff, otherCityLocation)).toBe(false);
    expect(await userCoversLocation(db, cityStaff, otherProviderLocation)).toBe(false);
  });
});
