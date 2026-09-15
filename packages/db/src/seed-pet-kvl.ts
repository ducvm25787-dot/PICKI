import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const PET_OWNER_PHONE = "+84912154451";

const PET = {
  slug: "pet-spa-kim-van",
  brandName: "PET SPA KIM VĂN",
  locationSlug: "pet-spa-kim-van-shop",
  displayName: "PET SPA KIM VĂN — CT12",
  tagline: "Spa thú cưng, trông pet, dắt chó — gộp một tiệm",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9889,
  lng: 105.8424,
} as const;

const OFFERINGS = [
  {
    slug: "tam-cat-tia",
    name: "Tắm + cắt tỉa",
    description: "Tắm sạch, cắt tỉa lông cơ bản — mang pet tới tiệm",
    referencePriceVnd: 150_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 1,
  },
  {
    slug: "spa-grooming",
    name: "Spa grooming",
    description: "Grooming full — báo giá theo size pet",
    referencePriceVnd: 250_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 2,
  },
  {
    slug: "trong-pet-tai-nha",
    name: "Trông pet tại nhà",
    description: "Nhân viên tới nhà trông chó/mèo theo ngày hoặc ca",
    referencePriceVnd: 200_000,
    pricingKind: "FROM",
    fulfillmentMode: "PROVIDER_VISIT",
    sortOrder: 3,
  },
  {
    slug: "dat-cho-di-dao",
    name: "Dắt chó đi dạo",
    description: "Dắt chó quanh khu CT12 — theo giờ hoặc buổi",
    referencePriceVnd: 80_000,
    pricingKind: "FROM",
    fulfillmentMode: "PROVIDER_VISIT",
    sortOrder: 4,
  },
] as const;

async function userIdForPhone(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
): Promise<string | undefined> {
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_identities
    WHERE provider = 'PHONE' AND external_user_id = ${phone}
    LIMIT 1
  `;
  return existing[0]?.user_id;
}

async function ensureUser(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
  displayName: string,
) {
  const existingId = await userIdForPhone(sql, phone);
  if (existingId) return existingId;

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (display_name) VALUES (${displayName}) RETURNING id
  `;
  if (!user) throw new Error("Failed to create user");

  await sql`
    INSERT INTO user_identities (user_id, provider, external_user_id, verified_at)
    VALUES (${user.id}::uuid, 'PHONE', ${phone}, now())
  `;
  return user.id;
}

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  try {
    const zone = await sql<{ id: string }[]>`
      SELECT id FROM zones WHERE slug = ${KVL_SLUG} LIMIT 1
    `;
    if (!zone[0]) {
      console.error("KVL zone missing — run seed:kvl first");
      process.exit(1);
    }

    let providerId = "";
    let locationId = "";

    const existing = await sql<{ id: string; location_id: string }[]>`
      SELECT p.id, pl.id AS location_id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = ${PET.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Pet provider already seeded:", PET.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${PET.slug}, ${PET.brandName}, ${"PET_SERVICE"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create pet provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${PET.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${PET.locationSlug},
            ${PET.displayName},
            ${"ACTIVE"},
            ${PET.address},
            ${PET.lat},
            ${PET.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create pet location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (provider_location_id, status, message, estimated_wait_minutes)
          VALUES (${location.id}::uuid, ${"OPEN"}, ${"~30 phút"}, ${30})
        `;
      });
    }

    for (const item of OFFERINGS) {
      const offeringRow = await sql<{ id: string }[]>`
        SELECT id FROM offerings
        WHERE provider_id = ${providerId}::uuid AND slug = ${item.slug}
        LIMIT 1
      `;
      let offeringId = offeringRow[0]?.id;
      if (!offeringId) {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO offerings (
            provider_id, slug, name, description, offering_type, status,
            sort_order, fulfillment_mode
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${"SERVICE"},
            ${"ACTIVE"},
            ${item.sortOrder},
            ${item.fulfillmentMode}
          )
          RETURNING id
        `;
        offeringId = created?.id;
      }
      if (!offeringId) continue;

      const priceExists = await sql<{ id: string }[]>`
        SELECT id FROM offering_prices
        WHERE offering_id = ${offeringId}::uuid
          AND provider_location_id = ${locationId}::uuid
        LIMIT 1
      `;
      if (!priceExists[0]) {
        await sql`
          INSERT INTO offering_prices (
            offering_id, provider_location_id, amount_vnd, pricing_kind
          ) VALUES (
            ${offeringId}::uuid,
            ${locationId}::uuid,
            ${item.referencePriceVnd},
            ${item.pricingKind}
          )
        `;
      }
      console.log("Seeded pet offering:", item.name);
    }

    const ownerId = await ensureUser(sql, PET_OWNER_PHONE, "Chủ PET SPA Kim Văn");

    const memberExists = await sql<{ id: string }[]>`
      SELECT id FROM provider_members
      WHERE user_id = ${ownerId}::uuid AND provider_id = ${providerId}::uuid
      LIMIT 1
    `;
    if (!memberExists[0]) {
      await sql`
        INSERT INTO provider_members (user_id, provider_id, provider_location_id, role)
        VALUES (${ownerId}::uuid, ${providerId}::uuid, ${locationId}::uuid, 'OWNER')
      `;
    }

    const roleExists = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${ownerId}::uuid AND role = 'PROVIDER_OWNER'
      LIMIT 1
    `;
    if (!roleExists[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role)
        VALUES (${ownerId}::uuid, 'PROVIDER_OWNER')
      `;
    }

    console.log("Pet owner login:", PET_OWNER_PHONE, "(UI: 0912154451) → PET SPA KIM VĂN");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
