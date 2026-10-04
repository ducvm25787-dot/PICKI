import { eq } from "drizzle-orm";
import { createPickiDb } from "./client.js";
import { offerings, offeringPrices, productDailyAvailability } from "./schema/catalog.js";
import { experienceCities } from "./schema/experiences.js";
import { userIdentities, users } from "./schema/identity.js";
import { orders } from "./schema/orders.js";
import { providerMembers } from "./schema/provider-ops.js";
import {
  providerLiveStatus,
  providerLocations,
  providerZoneMemberships,
  providers,
} from "./schema/providers.js";
import { zones } from "./schema/zones.js";
import { migrate } from "./migrator.js";

const PHONES = {
  hq: "+84908888021",
  hanoi: "+84908888022",
  kimVan: "+84908888023",
  ct12: "+84908888024",
  customer: "+84908888025",
} as const;

function todayVn(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

async function ensureUser(db: ReturnType<typeof createPickiDb>["db"], phone: string, name: string) {
  const [existing] = await db
    .select({ userId: userIdentities.userId })
    .from(userIdentities)
    .where(eq(userIdentities.externalUserId, phone))
    .limit(1);
  if (existing) return existing.userId;
  const [user] = await db.insert(users).values({ displayName: name }).returning();
  await db.insert(userIdentities).values({
    userId: user!.id,
    provider: "PHONE",
    externalUserId: phone,
    verifiedAt: new Date(),
  });
  return user!.id;
}

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  await migrate({ databaseUrl });
  const { db, sql } = createPickiDb(databaseUrl);
  try {
    const [hanoi] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, "Hanoi")).limit(1);
    const [kimVan] = await db.select({ id: zones.id }).from(zones).where(eq(zones.slug, "kim-van-kim-lu")).limit(1);
    if (!hanoi || !kimVan) throw new Error("Cần Zone Kim Văn và thành phố Hà Nội");

    await db.insert(experienceCities).values({
      code: "ChainSouth",
      label: "Miền khác",
      slug: "chain-south",
      enabled: false,
    }).onConflictDoNothing();
    const [south] = await db.select({ id: experienceCities.id }).from(experienceCities).where(eq(experienceCities.code, "ChainSouth")).limit(1);

    async function ensureZone(slug: string, name: string, cityId: string, lng: number, lat: number) {
      const [existing] = await db.select({ id: zones.id }).from(zones).where(eq(zones.slug, slug)).limit(1);
      if (existing) return existing.id;
      const [created] = await db.insert(zones).values({
        slug,
        name,
        displayName: name,
        status: "DRAFT",
        cityId,
        anchorLng: lng,
        anchorLat: lat,
      }).returning();
      return created!.id;
    }

    const daiKim = await ensureZone("demo-chain-dai-kim", "Đại Kim", hanoi.id, 105.81, 20.97);
    const linhDam = await ensureZone("demo-chain-linh-dam", "Linh Đàm", hanoi.id, 105.89, 20.97);
    const ecoZone = await ensureZone("demo-chain-eco", "Eco Zone", south!.id, 106.7, 10.8);

    const [provider] = await db.insert(providers).values({
      slug: "demo-chain",
      brandName: "Demo Chain",
      providerType: "FOOD_STALL",
      commerceModel: "FOOD_SERVICE",
      status: "DRAFT",
    }).onConflictDoNothing().returning();
    const [brand] = provider
      ? [provider]
      : await db.select().from(providers).where(eq(providers.slug, "demo-chain")).limit(1);

    async function ensureLocation(slug: string, name: string, status: string) {
      const [existing] = await db.select({ id: providerLocations.id }).from(providerLocations).where(eq(providerLocations.slug, slug)).limit(1);
      if (existing) return existing.id;
      const [created] = await db.insert(providerLocations).values({
        providerId: brand!.id,
        slug,
        displayName: name,
        status,
      }).returning();
      return created!.id;
    }

    const ct12 = await ensureLocation("demo-chain-ct12", "CT12", "ACTIVE");
    const hh1 = await ensureLocation("demo-chain-hh1", "HH1", "ACTIVE");
    const eco = await ensureLocation("demo-chain-eco", "EcoGreen", "PAUSED");

    async function ensureMembership(locationId: string, zoneId: string) {
      const [existing] = await db.select({ id: providerZoneMemberships.id }).from(providerZoneMemberships).where(eq(providerZoneMemberships.providerLocationId, locationId));
      const rows = await db.select({ zoneId: providerZoneMemberships.zoneId }).from(providerZoneMemberships).where(eq(providerZoneMemberships.providerLocationId, locationId));
      if (rows.some((row) => row.zoneId === zoneId)) return;
      if (existing && rows.length > 0) {
        await db.insert(providerZoneMemberships).values({ providerLocationId: locationId, zoneId, status: "ACTIVE" });
        return;
      }
      await db.insert(providerZoneMemberships).values({ providerLocationId: locationId, zoneId, status: "ACTIVE" });
    }
    await ensureMembership(ct12, kimVan.id);
    await ensureMembership(ct12, daiKim);
    await ensureMembership(hh1, linhDam);
    await ensureMembership(eco, ecoZone);

    await db.insert(providerLiveStatus).values([
      { providerLocationId: ct12, status: "OPEN" },
      { providerLocationId: hh1, status: "OPEN" },
      { providerLocationId: eco, status: "CLOSED" },
    ]).onConflictDoNothing();

    const hq = await ensureUser(db, PHONES.hq, "Demo Chain HQ");
    const hanoiUser = await ensureUser(db, PHONES.hanoi, "Demo Chain Hà Nội");
    const zoneUser = await ensureUser(db, PHONES.kimVan, "Demo Chain Kim Văn");
    const ctUser = await ensureUser(db, PHONES.ct12, "Demo Chain CT12");
    const customer = await ensureUser(db, PHONES.customer, "Khách Demo Chain");

    const memberRows = [
      { userId: hq, role: "OWNER", scopeType: "PROVIDER", scopeId: brand!.id },
      { userId: hanoiUser, role: "MANAGER", scopeType: "CITY", scopeId: hanoi.id },
      { userId: zoneUser, role: "MANAGER", scopeType: "ZONE", scopeId: kimVan.id },
      { userId: ctUser, role: "STAFF", scopeType: "LOCATION", scopeId: ct12 },
    ];
    for (const member of memberRows) {
      const [existing] = await db.select({ id: providerMembers.id }).from(providerMembers).where(eq(providerMembers.userId, member.userId)).limit(1);
      if (existing) continue;
      await db.insert(providerMembers).values({ ...member, providerId: brand!.id });
    }

    const [offeringExisting] = await db.select({ id: offerings.id }).from(offerings).where(eq(offerings.slug, "sua-tuoi-180ml")).limit(1);
    const offeringId = offeringExisting?.id ?? (await db.insert(offerings).values({
      providerId: brand!.id,
      slug: "sua-tuoi-180ml",
      name: "Sữa tươi 180ml",
      status: "ACTIVE",
    }).returning())[0]!.id;

    const day = todayVn();
    const prices = [
      { locationId: ct12, price: 7000, qty: 24, status: "AVAILABLE" },
      { locationId: hh1, price: 7000, qty: 0, status: "SOLD_OUT" },
      { locationId: eco, price: 7500, qty: 18, status: "AVAILABLE" },
    ];
    for (const row of prices) {
      const [price] = await db.select({ id: offeringPrices.id }).from(offeringPrices).where(eq(offeringPrices.providerLocationId, row.locationId));
      if (!price) {
        await db.insert(offeringPrices).values({ offeringId, providerLocationId: row.locationId, amountVnd: row.price });
      }
      const [stock] = await db.select({ id: productDailyAvailability.id }).from(productDailyAvailability).where(eq(productDailyAvailability.providerLocationId, row.locationId));
      if (!stock) {
        await db.insert(productDailyAvailability).values({
          providerId: brand!.id,
          providerLocationId: row.locationId,
          offeringId,
          serviceDate: day,
          status: row.status,
          availableQty: row.qty,
        });
      }
    }

    const orderRows = [
      { number: "DC-KV-1", zoneId: kimVan.id, locationId: ct12 },
      { number: "DC-DK-1", zoneId: daiKim, locationId: ct12 },
      { number: "DC-HH-1", zoneId: linhDam, locationId: hh1 },
      { number: "DC-ECO-1", zoneId: ecoZone, locationId: eco },
    ];
    for (const row of orderRows) {
      const [existing] = await db.select({ id: orders.id }).from(orders).where(eq(orders.orderNumber, row.number)).limit(1);
      if (existing) continue;
      await db.insert(orders).values({
        orderNumber: row.number,
        customerUserId: customer,
        zoneId: row.zoneId,
        providerLocationId: row.locationId,
        status: "CREATED",
        subtotalVnd: 7000,
        totalVnd: 7000,
      });
    }

    console.log("Demo Chain sẵn sàng. HQ 0908888021 · Hà Nội 0908888022 · Kim Văn 0908888023 · CT12 0908888024");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
