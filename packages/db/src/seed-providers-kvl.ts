import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const DEMO_PROVIDERS = [
  {
    slug: "com-tam-kim-van",
    brandName: "Cơm Tấm Kim Văn",
    type: "FOOD_STALL",
    locationSlug: "kim-van-stall",
    displayName: "Cơm Tấm Kim Văn — CT12",
    tagline: "Cơm tấm sườn bì chả — ship nhanh quanh CT",
    address: "CT12 Kim Văn, Hoàng Mai",
    lat: 20.9888,
    lng: 105.8418,
    liveStatus: "OPEN" as const,
  },
  {
    slug: "pho-ba-hang",
    brandName: "Phở Bà Hằng",
    type: "RESTAURANT",
    locationSlug: "kim-lu-main",
    displayName: "Phở Bà Hằng — Kim Lũ",
    tagline: "Phở bò tái nạm — mở sáng đến trưa",
    address: "Ngõ 15 Kim Lũ, Hoàng Mai",
    lat: 20.9875,
    lng: 105.8425,
    liveStatus: "OPEN" as const,
  },
  {
    slug: "bun-cha-ha-noi-kvl",
    brandName: "Bún Chả Hà Nội",
    type: "HOME_COOK",
    locationSlug: "home-kim-van",
    displayName: "Bún Chả cô Lan",
    tagline: "Nấu tại nhà — đặt trước 30 phút",
    address: "Tầng 1 CT11 Kim Văn",
    lat: 20.9891,
    lng: 105.8409,
    liveStatus: "BUSY" as const,
  },
] as const;

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  try {
    const zoneRows = await sql<{ id: string }[]>`
      SELECT id FROM zones WHERE slug = ${KVL_SLUG} LIMIT 1
    `;
    const zoneId = zoneRows[0]?.id;
    if (!zoneId) {
      console.error("KVL zone not found — run seed:kvl first");
      process.exit(1);
    }

    for (const demo of DEMO_PROVIDERS) {
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM providers WHERE slug = ${demo.slug} LIMIT 1
      `;
      if (existing[0]) {
        await sql`
          UPDATE provider_locations pl SET
            lat = ${demo.lat},
            lng = ${demo.lng},
            address_line = ${demo.address},
            pin_verified_at = COALESCE(pl.pin_verified_at, now()),
            updated_at = now()
          FROM providers p
          WHERE pl.provider_id = p.id AND p.slug = ${demo.slug}
        `;
        console.log("Provider pin refreshed:", demo.slug);
        continue;
      }

      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${demo.slug}, ${demo.brandName}, ${demo.type}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error(`Failed to create provider ${demo.slug}`);

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${demo.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${demo.locationSlug},
            ${demo.displayName},
            ${"ACTIVE"},
            ${demo.address},
            ${demo.lat},
            ${demo.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error(`Failed to create location for ${demo.slug}`);

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zoneId}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (provider_location_id, status)
          VALUES (${location.id}::uuid, ${demo.liveStatus})
        `;

        console.log("Seeded provider:", demo.brandName);
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
