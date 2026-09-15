import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const SPORTS_OWNER_PHONE = "+84908888008";

const VENUE = {
  slug: "san-ct12-kim-van",
  brandName: "SÂN CT12 KIM VĂN",
  locationSlug: "san-ct12-kim-van",
  displayName: "SÂN CT12 — Đặt sân thể thao",
  tagline: "Pickleball, bóng đá, cầu lông, bóng rổ, bóng bàn — gửi yêu cầu khung giờ",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9882,
  lng: 105.8428,
} as const;

const OFFERINGS = [
  {
    slug: "pickleball",
    name: "Sân Pickleball",
    description: "Thuê theo giờ — gửi khung giờ mong muốn",
    referencePriceVnd: 150_000,
    pricingKind: "FROM",
    sortOrder: 1,
  },
  {
    slug: "bong-da-mini",
    name: "Sân bóng đá mini",
    description: "Sân 5–7 người — đặt ca sáng/chiều/tối",
    referencePriceVnd: 400_000,
    pricingKind: "FROM",
    sortOrder: 2,
  },
  {
    slug: "cau-long",
    name: "Sân cầu lông",
    description: "Thuê sân theo giờ",
    referencePriceVnd: 80_000,
    pricingKind: "FROM",
    sortOrder: 3,
  },
  {
    slug: "bong-ro",
    name: "Sân bóng rổ",
    description: "Full / half court — báo số người khi đặt",
    referencePriceVnd: 200_000,
    pricingKind: "FROM",
    sortOrder: 4,
  },
  {
    slug: "bong-ban",
    name: "Bàn bóng bàn",
    description: "Thuê bàn theo giờ",
    referencePriceVnd: 50_000,
    pricingKind: "FROM",
    sortOrder: 5,
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
      WHERE p.slug = ${VENUE.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Sports venue already seeded:", VENUE.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${VENUE.slug}, ${VENUE.brandName}, ${"SPORTS_FACILITY"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create sports provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${VENUE.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${VENUE.locationSlug},
            ${VENUE.displayName},
            ${"ACTIVE"},
            ${VENUE.address},
            ${VENUE.lat},
            ${VENUE.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create sports location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (
            provider_location_id, status, message
          ) VALUES (
            ${location.id}::uuid,
            ${"OPEN"},
            ${"Nhận đặt sân hôm nay"}
          )
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
            ${"BOOKING"},
            ${"ACTIVE"},
            ${item.sortOrder},
            ${"CUSTOMER_VISIT"}
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
      console.log("Seeded sports offering:", item.name);
    }

    const ownerId = await ensureUser(sql, SPORTS_OWNER_PHONE, "Chủ Sân CT12 Kim Văn");

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

    console.log("Sports owner login:", SPORTS_OWNER_PHONE, "(UI: 0908888008) → Sân CT12 Kim Văn");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
