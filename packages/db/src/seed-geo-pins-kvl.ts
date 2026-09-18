import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

/**
 * Idempotent geo backfill for KVL pilot:
 * - Provider location lat/lng + pin_verified
 * - Demo customer (+84901234567) membership + address with coordinates
 *
 * Safe to re-run. Does not invent new brands — only updates existing locations.
 */

const KVL_SLUG = "kim-van-kim-lu";
const CUSTOMER_PHONE = "+84901234567";

/** Known demo pins — spread around Kim Văn – Kim Lũ demand core (WGS84). */
const PROVIDER_PINS: { slug: string; lat: number; lng: number; address?: string }[] = [
  { slug: "com-tam-kim-van", lat: 20.9888, lng: 105.8418, address: "CT12 Kim Văn, Hoàng Mai" },
  { slug: "pho-ba-hang", lat: 20.9875, lng: 105.8425, address: "Ngõ 15 Kim Lũ, Hoàng Mai" },
  { slug: "bun-cha-ha-noi-kvl", lat: 20.9891, lng: 105.8409, address: "Tầng 1 CT11 Kim Văn" },
  { slug: "giat-kim-van", lat: 20.9885, lng: 105.8415 },
  { slug: "dien-nuoc-kim-van", lat: 20.9888, lng: 105.8418 },
  { slug: "toc-minh-kim-van", lat: 20.9892, lng: 105.8422 },
  { slug: "rua-xe-kim-van", lat: 20.989, lng: 105.8426 },
  { slug: "san-ct12-kim-van", lat: 20.9882, lng: 105.8428 },
  { slug: "da-khoa-kim-van", lat: 20.9885, lng: 105.8419 },
  { slug: "nha-khoa-kim-van", lat: 20.9878, lng: 105.8431 },
  { slug: "dong-y-kim-van", lat: 20.9891, lng: 105.8409 },
  { slug: "nha-thuoc-kim-van", lat: 20.9882, lng: 105.8422 },
  { slug: "tap-hoa-kim-van", lat: 20.98835, lng: 105.84235 },
  { slug: "bep-nha-lan", lat: 20.9885, lng: 105.8425 },
  { slug: "pho-ga-kim-van", lat: 20.9886, lng: 105.8421 },
  { slug: "xe-kim-van", lat: 20.9885, lng: 105.8425 },
  { slug: "saomai-edu-kim-van", lat: 20.9885, lng: 105.842 },
  { slug: "pet-spa-kim-van", lat: 20.9889, lng: 105.8424 },
];

/** Customer delivery pin — CT12A lobby area (join GPS / dropoff). */
const CUSTOMER_HOME = {
  building: "CT12A",
  floor: "18",
  apartment: "1808",
  lat: 20.98855,
  lng: 105.84165,
};

async function ensureUser(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
  displayName: string,
) {
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_identities
    WHERE provider = 'PHONE' AND external_user_id = ${phone}
    LIMIT 1
  `;
  if (existing[0]) return existing[0].user_id;

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (display_name) VALUES (${displayName}) RETURNING id
  `;
  if (!user) throw new Error("Failed to create customer user");
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
    const zone = await sql<{ id: string; anchor_lat: number; anchor_lng: number }[]>`
      SELECT id, anchor_lat, anchor_lng FROM zones WHERE slug = ${KVL_SLUG} LIMIT 1
    `;
    if (!zone[0]) {
      console.error("KVL zone missing — run seed:kvl first");
      process.exit(1);
    }
    const zoneId = zone[0].id;
    const anchor = { lat: zone[0].anchor_lat, lng: zone[0].anchor_lng };

    let updatedProviders = 0;
    for (const pin of PROVIDER_PINS) {
      const locs = await sql<{ id: string }[]>`
        SELECT pl.id
        FROM provider_locations pl
        INNER JOIN providers p ON p.id = pl.provider_id
        WHERE p.slug = ${pin.slug}
      `;
      for (const loc of locs) {
        await sql`
          UPDATE provider_locations SET
            lat = ${pin.lat},
            lng = ${pin.lng},
            address_line = COALESCE(${pin.address ?? null}, address_line),
            pin_verified_at = now(),
            pin_note = ${"Seed geo pin KVL — demo verified"},
            updated_at = now()
          WHERE id = ${loc.id}::uuid
        `;
        updatedProviders += 1;
      }
    }

    // Any other ACTIVE location in Zone still missing coords → anchor + tiny offset by row
    const missing = await sql<{ id: string; n: number }[]>`
      SELECT pl.id, ROW_NUMBER() OVER (ORDER BY p.brand_name)::int AS n
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE'
        AND (pl.lat IS NULL OR pl.lng IS NULL)
    `;
    for (const row of missing) {
      const dLat = ((row.n % 5) - 2) * 0.00035;
      const dLng = ((row.n % 7) - 3) * 0.00035;
      await sql`
        UPDATE provider_locations SET
          lat = ${anchor.lat + dLat},
          lng = ${anchor.lng + dLng},
          pin_verified_at = now(),
          pin_note = ${"Seed geo pin — fallback near Zone anchor"},
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
      updatedProviders += 1;
    }

    const customerId = await ensureUser(sql, CUSTOMER_PHONE, "Khách KVL Demo");

    const mem = await sql<{ id: string; default_address_id: string | null }[]>`
      SELECT id, default_address_id FROM user_zone_memberships
      WHERE user_id = ${customerId}::uuid AND zone_id = ${zoneId}::uuid
        AND status IN ('JOINED', 'VERIFIED')
      LIMIT 1
    `;
    if (!mem[0]) {
      await sql`
        INSERT INTO user_zone_memberships (user_id, zone_id, status, joined_at)
        VALUES (${customerId}::uuid, ${zoneId}::uuid, 'JOINED', now())
      `;
    }

    const existingAddr = await sql<{ id: string }[]>`
      SELECT a.id
      FROM user_addresses ua
      INNER JOIN addresses a ON a.id = ua.address_id
      WHERE ua.user_id = ${customerId}::uuid AND ua.zone_id = ${zoneId}::uuid
      ORDER BY ua.created_at
      LIMIT 1
    `;

    let addressId = existingAddr[0]?.id;
    if (!addressId) {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO addresses (
          zone_id, address_type, building, floor, apartment, city,
          coordinates
        ) VALUES (
          ${zoneId}::uuid,
          'RESIDENTIAL',
          ${CUSTOMER_HOME.building},
          ${CUSTOMER_HOME.floor},
          ${CUSTOMER_HOME.apartment},
          'Hà Nội',
          ST_SetSRID(ST_MakePoint(${CUSTOMER_HOME.lng}, ${CUSTOMER_HOME.lat}), 4326)
        )
        RETURNING id
      `;
      if (!created) throw new Error("Failed to create customer address");
      addressId = created.id;
      await sql`
        INSERT INTO address_verifications (address_id, status, verified_at)
        VALUES (${addressId}::uuid, 'LEVEL_1_VALIDATED', now())
      `;
      await sql`
        INSERT INTO user_addresses (user_id, address_id, zone_id, label)
        VALUES (${customerId}::uuid, ${addressId}::uuid, ${zoneId}::uuid, 'HOME')
      `;
    } else {
      await sql`
        UPDATE addresses SET
          building = COALESCE(building, ${CUSTOMER_HOME.building}),
          floor = COALESCE(floor, ${CUSTOMER_HOME.floor}),
          apartment = COALESCE(apartment, ${CUSTOMER_HOME.apartment}),
          coordinates = ST_SetSRID(ST_MakePoint(${CUSTOMER_HOME.lng}, ${CUSTOMER_HOME.lat}), 4326),
          updated_at = now()
        WHERE id = ${addressId}::uuid
      `;
    }

    await sql`
      UPDATE user_zone_memberships SET
        default_address_id = ${addressId}::uuid,
        status = 'JOINED',
        updated_at = now()
      WHERE user_id = ${customerId}::uuid AND zone_id = ${zoneId}::uuid
    `;
    await sql`
      UPDATE users SET active_zone_id = ${zoneId}::uuid, updated_at = now()
      WHERE id = ${customerId}::uuid
    `;

    // Backfill any other KVL addresses missing coordinates (all members)
    const bare = await sql<{ id: string }[]>`
      SELECT a.id
      FROM addresses a
      WHERE a.zone_id = ${zoneId}::uuid AND a.coordinates IS NULL
    `;
    for (const row of bare) {
      await sql`
        UPDATE addresses SET
          coordinates = ST_SetSRID(ST_MakePoint(${CUSTOMER_HOME.lng}, ${CUSTOMER_HOME.lat}), 4326),
          updated_at = now()
        WHERE id = ${row.id}::uuid
      `;
    }

    console.log("Geo pins seeded (KVL):");
    console.log("  Provider locations updated:", updatedProviders);
    console.log("  Customer:", CUSTOMER_PHONE, "(UI: 0901234567) →", CUSTOMER_HOME.building, CUSTOMER_HOME.apartment);
    console.log("  Customer pin:", CUSTOMER_HOME.lat, CUSTOMER_HOME.lng);
    console.log("  Addresses backfilled (null coords):", bare.length);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
