import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const PROVIDER_PHONE = "+84908888001";

const LAUNDRY = {
  slug: "giat-kim-van",
  brandName: "Giặt Kim Văn",
  locationSlug: "giat-kim-van-shop",
  displayName: "Giặt Kim Văn — CT12",
  tagline: "Giặt quần áo, chăn màn, giày, rèm — lấy đồ tận nhà",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9885,
  lng: 105.8415,
} as const;

const OFFERINGS = [
  { slug: "giat-quan-ao", name: "Giặt quần áo (kg)", amountVnd: 25000, sortOrder: 1 },
  { slug: "giat-chan-man", name: "Giặt chăn màn (bộ)", amountVnd: 90000, sortOrder: 2 },
  { slug: "giat-giay", name: "Giặt giày (đôi)", amountVnd: 50000, sortOrder: 3 },
  { slug: "giat-rem", name: "Giặt rèm cửa (m²)", amountVnd: 40000, sortOrder: 4 },
] as const;

const LEGACY_SLUGS = ["giat-say-kg", "giat-hap", "giat-chan-ga"];

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
      const exists = await sql<{ id: string }[]>`
        SELECT id FROM offerings
        WHERE provider_id = ${providerId}::uuid AND slug = ${item.slug}
        LIMIT 1
      `;
      if (exists[0]) continue;

      await sql.begin(async (tx) => {
        const [offering] = await tx<{ id: string }[]>`
          INSERT INTO offerings (
            provider_id, slug, name, sort_order, status, fulfillment_mode
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.sortOrder},
            ${"ACTIVE"},
            ${"PICKUP_AND_RETURN"}
          )
          RETURNING id
        `;
        if (!offering) throw new Error(`Failed offering ${item.slug}`);

        await tx`
          INSERT INTO offering_prices (
            offering_id, provider_location_id, amount_vnd, pricing_kind
          ) VALUES (
            ${offering.id}::uuid,
            ${locationId}::uuid,
            ${item.amountVnd},
            ${"FIXED"}
          )
        `;
      });
      console.log("Seeded laundry offering:", item.name);
    }

    const owner = await sql<{ user_id: string }[]>`
      SELECT user_id FROM user_identities
      WHERE provider = 'PHONE' AND external_user_id = ${PROVIDER_PHONE}
      LIMIT 1
    `;
    if (owner[0]) {
      const memberExists = await sql<{ id: string }[]>`
        SELECT id FROM provider_members
        WHERE user_id = ${owner[0].user_id}::uuid AND provider_id = ${providerId}::uuid
        LIMIT 1
      `;
      if (!memberExists[0]) {
        await sql`
          INSERT INTO provider_members (user_id, provider_id, provider_location_id, role)
          VALUES (
            ${owner[0].user_id}::uuid,
            ${providerId}::uuid,
            ${locationId}::uuid,
            'OWNER'
          )
        `;
        console.log("Linked demo provider login to laundry shop");
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
