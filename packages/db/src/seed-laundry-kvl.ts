import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
/** Dedicated laundry owner — separate from food demo 0908888001 */
const LAUNDRY_OWNER_PHONE = "+84908888004";
const FOOD_OWNER_PHONE = "+84908888001";

const LAUNDRY = {
  slug: "giat-kim-van",
  brandName: "Giặt Kim Văn",
  locationSlug: "giat-kim-van-shop",
  displayName: "Giặt Kim Văn — CT12",
  tagline: "Giặt quần áo, chăn màn, giày, rèm, sofa — lấy đồ tận nhà hoặc giặt tại nhà",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9885,
  lng: 105.8415,
} as const;

const OFFERINGS = [
  {
    slug: "giat-quan-ao",
    name: "Giặt quần áo",
    description: "Giặt thường · tham khảo theo kg",
    referencePriceVnd: 20_000,
    priceUnit: "/kg",
    estimatedDays: 1,
    fulfillmentMode: "PICKUP_AND_RETURN",
    sortOrder: 1,
  },
  {
    slug: "giat-chan-man",
    name: "Giặt chăn, ga, gối",
    description: "Giặt khô hoặc giặt nước · tham khảo theo bộ",
    referencePriceVnd: 60_000,
    priceUnit: "/bộ",
    estimatedDays: 2,
    fulfillmentMode: "PICKUP_AND_RETURN",
    sortOrder: 2,
  },
  {
    slug: "giat-giay",
    name: "Giặt giày",
    description: "Vệ sinh giày sneaker, da · tham khảo theo đôi",
    referencePriceVnd: 40_000,
    priceUnit: "/đôi",
    estimatedDays: 2,
    fulfillmentMode: "PICKUP_AND_RETURN",
    sortOrder: 3,
  },
  {
    slug: "giat-rem",
    name: "Giặt rèm cửa",
    description: "Giặt rèm treo, rèm cuốn · tham khảo theo m²",
    referencePriceVnd: 35_000,
    priceUnit: "/m²",
    estimatedDays: 3,
    fulfillmentMode: "PICKUP_AND_RETURN",
    sortOrder: 4,
  },
  {
    slug: "giat-sofa-tham-dem",
    name: "Giặt sofa, thảm, đệm (tại nhà)",
    description: "Nhân viên đến tận nhà · báo giá theo diện tích thực tế",
    referencePriceVnd: 150_000,
    priceUnit: "/lần",
    estimatedDays: 1,
    fulfillmentMode: "ON_SITE",
    sortOrder: 5,
  },
] as const;

const LEGACY_SLUGS = ["giat-say-kg", "giat-hap", "giat-chan-ga"];

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
      WHERE p.slug = ${LAUNDRY.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Laundry provider already seeded:", LAUNDRY.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${LAUNDRY.slug}, ${LAUNDRY.brandName}, ${"LAUNDRY"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create laundry provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${LAUNDRY.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${LAUNDRY.locationSlug},
            ${LAUNDRY.displayName},
            ${"ACTIVE"},
            ${LAUNDRY.address},
            ${LAUNDRY.lat},
            ${LAUNDRY.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create laundry location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (provider_location_id, status)
          VALUES (${location.id}::uuid, ${"OPEN"})
        `;
      });
      console.log("Seeded laundry provider:", LAUNDRY.brandName);
    }

    if (!providerId || !locationId) {
      throw new Error("Laundry provider/location missing after seed");
    }

    await sql`
      DELETE FROM offerings
      WHERE provider_id = ${providerId}::uuid AND slug = ANY(${LEGACY_SLUGS})
    `;

    for (const item of OFFERINGS) {
      const existingOffering = await sql<{ id: string }[]>`
        SELECT id FROM offerings
        WHERE provider_id = ${providerId}::uuid AND slug = ${item.slug}
        LIMIT 1
      `;

      let offeringId = existingOffering[0]?.id;
      if (offeringId) {
        await sql`
          UPDATE offerings SET
            name = ${item.name},
            description = ${item.description},
            sort_order = ${item.sortOrder},
            fulfillment_mode = ${item.fulfillmentMode},
            payment_policy = NULL,
            estimated_days = ${item.estimatedDays},
            updated_at = now()
          WHERE id = ${offeringId}::uuid
        `;
      } else {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO offerings (
            provider_id, slug, name, description, sort_order, status,
            fulfillment_mode, payment_policy, estimated_days
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${item.sortOrder},
            ${"ACTIVE"},
            ${item.fulfillmentMode},
            ${null},
            ${item.estimatedDays}
          )
          RETURNING id
        `;
        if (!created) throw new Error(`Failed offering ${item.slug}`);
        offeringId = created.id;
      }

      const priceExists = await sql<{ id: string }[]>`
        SELECT id FROM offering_prices
        WHERE offering_id = ${offeringId}::uuid AND provider_location_id = ${locationId}::uuid
        LIMIT 1
      `;
      if (priceExists[0]) {
        await sql`
          UPDATE offering_prices SET
            amount_vnd = ${item.referencePriceVnd},
            pricing_kind = 'FROM'
          WHERE id = ${priceExists[0].id}::uuid
        `;
      } else {
        await sql`
          INSERT INTO offering_prices (
            offering_id, provider_location_id, amount_vnd, pricing_kind
          ) VALUES (
            ${offeringId}::uuid,
            ${locationId}::uuid,
            ${item.referencePriceVnd},
            ${"FROM"}
          )
        `;
      }
      console.log("Seeded laundry offering:", item.name);
    }

    const foodOwnerId = await userIdForPhone(sql, FOOD_OWNER_PHONE);
    if (foodOwnerId) {
      await sql`
        DELETE FROM provider_members
        WHERE user_id = ${foodOwnerId}::uuid AND provider_id = ${providerId}::uuid
      `;
    }

    const laundryOwnerId = await ensureUser(sql, LAUNDRY_OWNER_PHONE, "Chủ tiệm Giặt Kim Văn");

    const memberExists = await sql<{ id: string }[]>`
      SELECT id FROM provider_members
      WHERE user_id = ${laundryOwnerId}::uuid AND provider_id = ${providerId}::uuid
      LIMIT 1
    `;
    if (!memberExists[0]) {
      await sql`
        INSERT INTO provider_members (user_id, provider_id, provider_location_id, role)
        VALUES (
          ${laundryOwnerId}::uuid,
          ${providerId}::uuid,
          ${locationId}::uuid,
          'OWNER'
        )
      `;
    }

    const roleExists = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${laundryOwnerId}::uuid AND role = 'PROVIDER_OWNER'
      LIMIT 1
    `;
    if (!roleExists[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role)
        VALUES (${laundryOwnerId}::uuid, 'PROVIDER_OWNER')
      `;
    }

    console.log("Laundry owner login:", LAUNDRY_OWNER_PHONE, "(UI: 0908888004) → Giặt Kim Văn only");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
