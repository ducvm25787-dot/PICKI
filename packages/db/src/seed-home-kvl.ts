import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const HOME_OWNER_PHONE = "+84908888005";

const HOME = {
  slug: "dien-nuoc-kim-van",
  brandName: "Điện Nước Kim Văn",
  locationSlug: "dien-nuoc-kim-van-shop",
  displayName: "Điện Nước Kim Văn — CT12",
  tagline: "Sửa điện, nước, điều hòa, máy giặt — thợ đến tận nhà",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9888,
  lng: 105.8418,
} as const;

const OFFERINGS = [
  {
    slug: "sua-dien",
    name: "Sửa điện",
    description: "Chập điện, thay ổ cắm, bóng đèn, aptomat",
    referencePriceVnd: 150_000,
    pricingKind: "FROM",
    sortOrder: 1,
  },
  {
    slug: "sua-nuoc",
    name: "Sửa nước / rò rỉ",
    description: "Ống nước, vòi sen, bồn cầu, siphon",
    referencePriceVnd: 120_000,
    pricingKind: "FROM",
    sortOrder: 2,
  },
  {
    slug: "ve-sinh-nha",
    name: "Vệ sinh nhà",
    description: "Dọn dẹp, lau kính, vệ sinh sau sửa chữa",
    referencePriceVnd: 200_000,
    pricingKind: "FROM",
    sortOrder: 3,
  },
  {
    slug: "sua-dieu-hoa",
    name: "Sửa / vệ sinh điều hòa",
    description: "Bảo dưỡng, nạp gas — báo giá sau khảo sát",
    referencePriceVnd: 0,
    pricingKind: "QUOTE_REQUIRED",
    sortOrder: 4,
  },
  {
    slug: "sua-may-giat",
    name: "Sửa máy giặt / tủ lạnh",
    description: "Kiểm tra tại nhà — báo giá theo hãng và lỗi",
    referencePriceVnd: 0,
    pricingKind: "QUOTE_REQUIRED",
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
      WHERE p.slug = ${HOME.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Home service provider already seeded:", HOME.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${HOME.slug}, ${HOME.brandName}, ${"HOME_SERVICE"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create home service provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${HOME.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${HOME.locationSlug},
            ${HOME.displayName},
            ${"ACTIVE"},
            ${HOME.address},
            ${HOME.lat},
            ${HOME.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create home service location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (provider_location_id, status, message)
          VALUES (${location.id}::uuid, ${"OPEN"}, ${"Đang nhận việc — có thể tới trong ~1h"})
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
            ${"PROVIDER_VISIT"}
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
      console.log("Seeded home offering:", item.name);
    }

    const ownerId = await ensureUser(sql, HOME_OWNER_PHONE, "Chủ Điện Nước Kim Văn");

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

    console.log("Home service owner login:", HOME_OWNER_PHONE, "(UI: 0908888005) → Điện Nước Kim Văn");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
