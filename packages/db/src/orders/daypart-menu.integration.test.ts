import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { migrate } from "../migrator.js";
import { offerings, productDailyAvailability } from "../schema/catalog.js";
import { experienceCities } from "../schema/experiences.js";
import { users } from "../schema/identity.js";
import { orders } from "../schema/orders.js";
import {
  breakfastPreorderDailyMenus,
  breakfastPreorderDeliveryWindows,
  breakfastPreorderMenuItems,
} from "../schema/breakfast-preorder.js";
import { providerLocations, providers } from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import { reserveOfferingStock, releaseOfferingStock } from "../commerce/stock.js";
import {
  releaseDaypartMenuCapacity,
  reserveDaypartMenuCapacity,
  DaypartCapacityError,
} from "./daypart-capacity.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("food daypart menus", () => {
  const { db, sql } = createPickiDb(databaseUrl);
  const slug = `daypart-${Date.now()}`;
  const serviceDate = "2026-10-02";
  let userId = "";
  let zoneId = "";
  let providerId = "";
  let locationId = "";
  let offeringId = "";
  let lunchItemId = "";
  let lunchWindowId = "";
  let orderId = "";

  beforeAll(async () => {
    await migrate({ databaseUrl });
    const [user] = await db.insert(users).values({ displayName: slug }).returning();
    const [city] = await db
      .select({ id: experienceCities.id })
      .from(experienceCities)
      .where(eq(experienceCities.code, "Hanoi"))
      .limit(1);
    const [zone] = await db
      .insert(zones)
      .values({
        slug,
        name: slug,
        displayName: slug,
        cityId: city!.id,
        anchorLng: 105.84,
        anchorLat: 20.98,
      })
      .returning();
    userId = user!.id;
    zoneId = zone!.id;
    const [provider] = await db
      .insert(providers)
      .values({
        slug,
        brandName: slug,
        providerType: "FOOD_STALL",
        commerceModel: "FOOD_SERVICE",
        status: "ACTIVE",
      })
      .returning();
    const [location] = await db
      .insert(providerLocations)
      .values({
        providerId: provider!.id,
        slug,
        displayName: slug,
        status: "ACTIVE",
      })
      .returning();
    const [offering] = await db
      .insert(offerings)
      .values({ providerId: provider!.id, slug: "pho", name: "Phở" })
      .returning();
    providerId = provider!.id;
    locationId = location!.id;
    offeringId = offering!.id;
    await db.insert(productDailyAvailability).values({
      providerId,
      providerLocationId: locationId,
      offeringId,
      serviceDate,
      status: "AVAILABLE",
      availableQty: 5,
    });
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: slug,
        customerUserId: userId,
        zoneId,
        providerLocationId: locationId,
        orderKind: "LUNCH",
        serviceDate,
        subtotalVnd: 45000,
        totalVnd: 45000,
      })
      .returning();
    orderId = order!.id;
  });

  afterAll(async () => {
    await db.delete(orders).where(eq(orders.id, orderId));
    await db.delete(breakfastPreorderDeliveryWindows).where(eq(breakfastPreorderDeliveryWindows.providerLocationId, locationId));
    await db.delete(breakfastPreorderDailyMenus).where(eq(breakfastPreorderDailyMenus.providerLocationId, locationId));
    await db.delete(offerings).where(eq(offerings.providerId, providerId));
    await db.delete(providerLocations).where(eq(providerLocations.id, locationId));
    await db.delete(providers).where(eq(providers.id, providerId));
    await db.delete(zones).where(eq(zones.id, zoneId));
    await db.delete(users).where(eq(users.id, userId));
    await sql.end({ timeout: 5 });
  });

  it("stores breakfast and lunch menus on the same day", async () => {
    const [breakfast] = await db
      .insert(breakfastPreorderDailyMenus)
      .values({
        providerLocationId: locationId,
        serviceDate,
        daypart: "BREAKFAST",
        status: "PUBLISHED",
      })
      .returning();
    const [lunch] = await db
      .insert(breakfastPreorderDailyMenus)
      .values({
        providerLocationId: locationId,
        serviceDate,
        daypart: "LUNCH",
        status: "PUBLISHED",
      })
      .returning();
    expect(breakfast!.id).not.toBe(lunch!.id);

    await expect(
      db.insert(breakfastPreorderDailyMenus).values({
        providerLocationId: locationId,
        serviceDate,
        daypart: "LUNCH",
        status: "DRAFT",
      }),
    ).rejects.toThrow();

    const [item] = await db
      .insert(breakfastPreorderMenuItems)
      .values({
        dailyMenuId: lunch!.id,
        offeringId,
        name: "Phở trưa",
        priceVnd: 45000,
        capacity: 2,
        remainingCapacity: 2,
        status: "ACTIVE",
      })
      .returning();
    const [window] = await db
      .insert(breakfastPreorderDeliveryWindows)
      .values({
        providerLocationId: locationId,
        serviceDate,
        daypart: "LUNCH",
        startsAt: "11:00",
        endsAt: "11:15",
        capacity: 2,
        remainingCapacity: 2,
        status: "OPEN",
      })
      .returning();
    lunchItemId = item!.id;
    lunchWindowId = window!.id;
  });

  it("reserves and releases lunch menu capacity and shared daily stock", async () => {
    await db.transaction(async (tx) => {
      await reserveDaypartMenuCapacity(tx, lunchWindowId, [
        { menuItemId: lunchItemId, quantity: 1, name: "Phở trưa" },
      ]);
      await reserveOfferingStock(tx, {
        orderId,
        providerLocationId: locationId,
        serviceDate,
        lines: [{ offeringId, quantity: 1, name: "Phở trưa" }],
      });
    });

    const [item] = await db
      .select()
      .from(breakfastPreorderMenuItems)
      .where(eq(breakfastPreorderMenuItems.id, lunchItemId));
    const [stock] = await db
      .select()
      .from(productDailyAvailability)
      .where(eq(productDailyAvailability.offeringId, offeringId));
    expect(item!.remainingCapacity).toBe(1);
    expect(stock!.reservedQty).toBe(1);

    await expect(
      db.transaction((tx) =>
        reserveDaypartMenuCapacity(tx, lunchWindowId, [
          { menuItemId: lunchItemId, quantity: 3, name: "Phở trưa" },
        ]),
      ),
    ).rejects.toBeInstanceOf(DaypartCapacityError);

    await db.transaction(async (tx) => {
      await releaseDaypartMenuCapacity(tx, lunchWindowId, [
        { menuItemId: lunchItemId, quantity: 1 },
      ]);
      await releaseOfferingStock(tx, orderId);
    });

    const [restored] = await db
      .select()
      .from(breakfastPreorderMenuItems)
      .where(eq(breakfastPreorderMenuItems.id, lunchItemId));
    const [stockAfter] = await db
      .select()
      .from(productDailyAvailability)
      .where(eq(productDailyAvailability.offeringId, offeringId));
    expect(restored!.remainingCapacity).toBe(2);
    expect(stockAfter!.reservedQty).toBe(0);
  });
});
