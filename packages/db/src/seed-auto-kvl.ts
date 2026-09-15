import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const AUTO_OWNER_PHONE = "+84908888007";

const SHOP = {
  slug: "rua-xe-kim-van",
  brandName: "RỬA XE KIM VĂN",
  locationSlug: "rua-xe-kim-van-shop",
  displayName: "RỬA XE KIM VĂN — CT12",
  tagline: "Xe máy · Ô tô — rửa xe & bơm lốp xem chờ live",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.989,
  lng: 105.8426,
} as const;

const OFFERINGS = [
  {
    slug: "rua-xe-may",
    name: "Rửa xe máy",
    description: "Rửa nhanh — xem đông vắng trước khi mang xe ra",
    referencePriceVnd: 30_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 1,
  },
  {
    slug: "bom-lop-xe-may",
    name: "Bơm lốp xe máy",
    description: "Bơm hơi — có thể báo sắp tới nếu đông",
    referencePriceVnd: 5_000,
    pricingKind: "FIXED",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 2,
  },
  {
    slug: "rua-xe-o-to",
    name: "Rửa xe ô tô",
    description: "Rửa ngoài cơ bản — xem thời gian chờ live",
    referencePriceVnd: 120_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 3,
  },
  {
    slug: "bom-lop-o-to",
    name: "Bơm lốp ô tô",
    description: "Bơm lốp tại tiệm",
    referencePriceVnd: 10_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    sortOrder: 4,
  },
  {
    slug: "thay-dau",
    name: "Thay dầu",
    description: "Liên hệ tiệm trực tiếp — không cần báo sắp tới",
    referencePriceVnd: null,
    pricingKind: "QUOTE_REQUIRED",
    fulfillmentMode: "CONTACT_ONLY",
    sortOrder: 5,
  },
  {
    slug: "sua-chua-bao-duong",
    name: "Sửa chữa / bảo dưỡng",
    description: "Gara — chat hoặc gọi để hẹn và báo giá",
    referencePriceVnd: null,
    pricingKind: "QUOTE_REQUIRED",
    fulfillmentMode: "CONTACT_ONLY",
    sortOrder: 6,
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
      WHERE p.slug = ${SHOP.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Auto provider already seeded:", SHOP.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${SHOP.slug}, ${SHOP.brandName}, ${"AUTO_SERVICE"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create auto provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${SHOP.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${SHOP.locationSlug},
            ${SHOP.displayName},
            ${"ACTIVE"},
            ${SHOP.address},
            ${SHOP.lat},
            ${SHOP.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create auto location");
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
            ${"~20 phút"},
            ${20}
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
            ${item.fulfillmentMode}
          )
          RETURNING id
        `;
        offeringId = created?.id;
      } else {
        await sql`
          UPDATE offerings
          SET fulfillment_mode = ${item.fulfillmentMode},
              description = ${item.description},
              sort_order = ${item.sortOrder}
          WHERE id = ${offeringId}::uuid
        `;
      }
      if (!offeringId) continue;

      // Dịch vụ báo giá (thay dầu, sửa chữa) vẫn cần dòng giá để hiện trong menu
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
            ${item.referencePriceVnd ?? 0},
            ${item.pricingKind}
          )
        `;
      }
      console.log("Seeded auto offering:", item.name);
    }

    const ownerId = await ensureUser(sql, AUTO_OWNER_PHONE, "Chủ Rửa Xe Kim Văn");

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

    console.log("Auto owner login:", AUTO_OWNER_PHONE, "(UI: 0908888007) → Rửa Xe Kim Văn");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
