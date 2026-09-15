import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const BEAUTY_OWNER_PHONE = "+84908888006";

const SALON = {
  slug: "toc-minh-kim-van",
  brandName: "Tóc Minh Kim Văn",
  locationSlug: "toc-minh-kim-van-shop",
  displayName: "Tóc Minh — CT12",
  tagline: "Cắt tóc, gội đầu, nail — khách tới tiệm",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9892,
  lng: 105.8422,
} as const;

const OFFERINGS = [
  {
    slug: "cat-toc-nam",
    name: "Cắt tóc nam",
    description: "Cắt + tạo kiểu cơ bản",
    referencePriceVnd: 80_000,
    pricingKind: "FIXED",
    sortOrder: 1,
  },
  {
    slug: "goi-cat",
    name: "Gội + cắt",
    description: "Gội dưỡng + cắt tóc",
    referencePriceVnd: 120_000,
    pricingKind: "FROM",
    sortOrder: 2,
  },
  {
    slug: "nail-gel",
    name: "Nail gel",
    description: "Sơn gel — báo giá theo mẫu",
    referencePriceVnd: 200_000,
    pricingKind: "FROM",
    sortOrder: 3,
  },
  {
    slug: "goi-duong",
    name: "Gội dưỡng",
    description: "Gội + massage da đầu",
    referencePriceVnd: 60_000,
    pricingKind: "FIXED",
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
      WHERE p.slug = ${SALON.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Beauty provider already seeded:", SALON.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${SALON.slug}, ${SALON.brandName}, ${"BEAUTY"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create beauty provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${SALON.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${SALON.locationSlug},
            ${SALON.displayName},
            ${"ACTIVE"},
            ${SALON.address},
            ${SALON.lat},
            ${SALON.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create beauty location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (
            provider_location_id, status, message, estimated_wait_minutes
          ) VALUES (
            ${location.id}::uuid,
            ${"OPEN"},
            ${"~15 phút"},
            ${15}
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
            ${"SERVICE"},
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
      console.log("Seeded beauty offering:", item.name);
    }

    const ownerId = await ensureUser(sql, BEAUTY_OWNER_PHONE, "Chủ Tóc Minh Kim Văn");

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

    console.log("Beauty owner login:", BEAUTY_OWNER_PHONE, "(UI: 0908888006) → Tóc Minh Kim Văn");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
