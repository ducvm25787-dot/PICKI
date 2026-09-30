import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { migrate } from "../migrator.js";
import { offerings, productDailyAvailability } from "../schema/catalog.js";
import { orders } from "../schema/orders.js";
import { providerLocations, providers } from "../schema/providers.js";
import { users } from "../schema/identity.js";
import { zones } from "../schema/zones.js";
import {
  addDailySellableQty,
  applyDailyStockAction,
  releaseOfferingStock,
  reserveOfferingStock,
  StockConflictError,
} from "./stock.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("offering daily stock", () => {
  const { db, sql } = createPickiDb(databaseUrl);
  const slug = `phase-a-stock-${Date.now()}`;
  let userId = "";
  let zoneId = "";
  let providerId = "";
  let locationId = "";
  let offeringId = "";
  let orderA = "";
  let orderB = "";
  const serviceDate = "2026-09-30";

  beforeAll(async () => {
    await migrate({ databaseUrl });
    const [user] = await db.insert(users).values({ displayName: slug }).returning();
    const [zone] = await db
      .insert(zones)
      .values({
        slug,
        name: slug,
        displayName: slug,
        anchorLng: 105.84,
        anchorLat: 20.98,
      })
      .returning();
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
      .values({ providerId: provider!.id, slug: "chim-cau", name: "Chim câu" })
      .returning();
    userId = user!.id;
    zoneId = zone!.id;
    providerId = provider!.id;
    locationId = location!.id;
    offeringId = offering!.id;

    const inserted = await db
      .insert(orders)
      .values([
        {
          orderNumber: `${slug}-a`,
          customerUserId: userId,
          zoneId,
          providerLocationId: locationId,
          subtotalVnd: 1000,
          totalVnd: 1000,
        },
        {
          orderNumber: `${slug}-b`,
          customerUserId: userId,
          zoneId,
          providerLocationId: locationId,
          subtotalVnd: 1000,
          totalVnd: 1000,
        },
      ])
      .returning();
    orderA = inserted[0]!.id;
    orderB = inserted[1]!.id;

    await db.insert(productDailyAvailability).values({
      providerId,
      offeringId,
      serviceDate,
      status: "AVAILABLE",
      availableQty: 1,
    });
  });

  afterAll(async () => {
    await db.delete(orders).where(eq(orders.providerLocationId, locationId));
    await db.delete(offerings).where(eq(offerings.providerId, providerId));
    await db.delete(providerLocations).where(eq(providerLocations.id, locationId));
    await db.delete(providers).where(eq(providers.id, providerId));
    await db.delete(zones).where(eq(zones.id, zoneId));
    await db.delete(users).where(eq(users.id, userId));
    await sql.end({ timeout: 5 });
  });

  it("lets only one checkout reserve the last portion", async () => {
    const results = await Promise.allSettled([
      db.transaction((tx) =>
        reserveOfferingStock(tx, {
          orderId: orderA,
          serviceDate,
          lines: [{ offeringId, quantity: 1, name: "Chim câu" }],
        }),
      ),
      db.transaction((tx) =>
        reserveOfferingStock(tx, {
          orderId: orderB,
          serviceDate,
          lines: [{ offeringId, quantity: 1, name: "Chim câu" }],
        }),
      ),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    const reason = (failed[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(StockConflictError);
  });

  it("restores the portion on release, then opens again after +5", async () => {
    const winner = orderA;
    await db.transaction((tx) => releaseOfferingStock(tx, winner));
    await db.transaction((tx) => releaseOfferingStock(tx, orderB));

    const [row] = await db
      .select()
      .from(productDailyAvailability)
      .where(eq(productDailyAvailability.offeringId, offeringId))
      .limit(1);
    expect(row?.reservedQty).toBe(0);
    expect(row?.status).toBe("AVAILABLE");

    await db.transaction((tx) =>
      reserveOfferingStock(tx, {
        orderId: orderA,
        serviceDate,
        lines: [{ offeringId, quantity: 1, name: "Chim câu" }],
      }),
    );
    await db.transaction((tx) =>
      addDailySellableQty(tx, { offeringId, serviceDate, quantity: 5 }),
    );
    const [restocked] = await db
      .select()
      .from(productDailyAvailability)
      .where(eq(productDailyAvailability.offeringId, offeringId))
      .limit(1);
    expect(restocked?.availableQty).toBe(6);
    expect(restocked?.status).toBe("AVAILABLE");
    expect((restocked?.availableQty ?? 0) - (restocked?.reservedQty ?? 0)).toBe(5);
  });

  it("blocks checkout of a hidden dish even without a quantity", async () => {
    const [hidden] = await db
      .insert(offerings)
      .values({ providerId, slug: `${slug}-an`, name: "Món ẩn" })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: `${slug}-h`,
        customerUserId: userId,
        zoneId,
        providerLocationId: locationId,
        subtotalVnd: 1000,
        totalVnd: 1000,
      })
      .returning();
    await db.transaction((tx) =>
      applyDailyStockAction(tx, {
        offeringId: hidden!.id,
        serviceDate,
        action: "hide",
      }),
    );
    await expect(
      db.transaction((tx) =>
        reserveOfferingStock(tx, {
          orderId: order!.id,
          serviceDate,
          lines: [{ offeringId: hidden!.id, quantity: 1, name: "Món ẩn" }],
        }),
      ),
    ).rejects.toBeInstanceOf(StockConflictError);
  });

  it("keeps demo food capabilities on the existing shops", async () => {
    const rows = await sql<
      { slug: string; commerce_model: string | null; capability: string; enabled: boolean }[]
    >`
      SELECT p.slug, p.commerce_model, c.capability, c.enabled
      FROM providers p
      LEFT JOIN provider_capabilities c ON c.provider_id = p.id
      WHERE p.slug IN ('com-tam-kim-van', 'bep-nha-lan', 'pho-ga-kim-van')
      ORDER BY p.slug, c.capability
    `;
    if (rows.length === 0) return;

    const bySlug = new Map<string, Set<string>>();
    for (const row of rows) {
      const set = bySlug.get(row.slug) ?? new Set<string>();
      if (row.capability) set.add(row.capability);
      bySlug.set(row.slug, set);
      expect(row.commerce_model).toBe("FOOD_SERVICE");
    }
    expect(bySlug.get("com-tam-kim-van")?.has("SELL_NOW")).toBe(true);
    expect(bySlug.get("bep-nha-lan")?.has("FAMILY_DINNER")).toBe(true);
    const pho = bySlug.get("pho-ga-kim-van");
    expect(pho?.has("SELL_NOW")).toBe(true);
    expect(pho?.has("BREAKFAST_PREORDER")).toBe(true);
    expect(pho?.has("LATE_NIGHT")).toBe(true);
  });
});
