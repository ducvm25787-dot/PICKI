import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const MINIMART = {
  slug: "tap-hoa-kim-van",
  brandName: "TẠP HÓA KIM VĂN",
  locationSlug: "tap-hoa-kim-van-ct12",
  displayName: "Tạp hóa Kim Văn — CT12",
  tagline: "Gạo, sữa, đồ khô, đồ dùng — đặt giao tận căn hộ",
  address: "Chân đế CT12 Kim Văn, Hoàng Mai",
  lat: 20.98835,
  lng: 105.84235,
  ownerPhone: "+84908888013",
  ownerName: "Tạp hóa Kim Văn",
  liveMessage: "Đang mở — giao trong Zone hôm nay",
  primaryCategoryId: "a1000003-0000-4000-8000-000000000002",
  legacySlugs: ["gao-mi-gia-vi", "sua-bim", "nuoc-uong-snack", "hang-gia-dung"],
  offerings: [
    {
      slug: "gao-st25-5kg",
      name: "Gạo ST25 5kg",
      description: "Bao 5kg",
      unit: "gói",
      categoryId: "a1000003-0000-4000-8000-000000000002",
      priceVnd: 165_000,
      sortOrder: 1,
    },
    {
      slug: "mi-hao-hao",
      name: "Mì Hảo Hảo tôm chua cay",
      description: "Gói 75g",
      unit: "gói",
      categoryId: "a1000003-0000-4000-8000-000000000002",
      priceVnd: 5_000,
      sortOrder: 2,
    },
    {
      slug: "nuoc-mam-nam-ngu",
      name: "Nước mắm Nam Ngư 500ml",
      description: "Chai 500ml",
      unit: "chai",
      categoryId: "a1000003-0000-4000-8000-000000000002",
      priceVnd: 28_000,
      sortOrder: 3,
    },
    {
      slug: "dau-an-simply",
      name: "Dầu ăn Simply 1L",
      description: "Chai 1 lít",
      unit: "chai",
      categoryId: "a1000003-0000-4000-8000-000000000002",
      priceVnd: 52_000,
      sortOrder: 4,
    },
    {
      slug: "trung-ga-ta-10",
      name: "Trứng gà ta hộp 10 quả",
      description: "Hộp 10 quả",
      unit: "hộp",
      categoryId: "a1000002-0000-4000-8000-000000000006",
      priceVnd: 45_000,
      sortOrder: 5,
    },
    {
      slug: "sua-tuoi-1l",
      name: "Sữa tươi tiệt trùng 1L",
      description: "Hộp 1 lít",
      unit: "hộp",
      categoryId: "a1000003-0000-4000-8000-000000000001",
      priceVnd: 34_000,
      sortOrder: 6,
    },
    {
      slug: "nuoc-suoi-500",
      name: "Nước suối 500ml",
      description: "Chai 500ml",
      unit: "chai",
      categoryId: "a1000003-0000-4000-8000-000000000001",
      priceVnd: 6_000,
      sortOrder: 7,
    },
    {
      slug: "bim-size-m",
      name: "Bỉm sơ sinh size M",
      description: "Gói 50 miếng",
      unit: "gói",
      categoryId: "a1000003-0000-4000-8000-000000000005",
      priceVnd: 189_000,
      sortOrder: 8,
    },
    {
      slug: "nuoc-rua-chen",
      name: "Nước rửa chén 750ml",
      description: "Chai 750ml",
      unit: "chai",
      categoryId: "a1000003-0000-4000-8000-000000000004",
      priceVnd: 32_000,
      sortOrder: 9,
    },
    {
      slug: "rau-muong",
      name: "Rau muống",
      description: "Một bó",
      unit: "bó",
      categoryId: "a1000002-0000-4000-8000-000000000001",
      priceVnd: 8_000,
      sortOrder: 10,
    },
    {
      slug: "thit-heo-ba-chi-500g",
      name: "Thịt heo ba chỉ 500g",
      description: "Khay 500g, có sơ chế nếu cần",
      unit: "500g",
      categoryId: "a1000002-0000-4000-8000-000000000003",
      priceVnd: 65_000,
      sortOrder: 11,
      prep: true,
    },
    {
      slug: "ca-basa-500g",
      name: "Cá basa khay 500g",
      description: "Khay fillet 500g",
      unit: "khay",
      categoryId: "a1000002-0000-4000-8000-000000000004",
      priceVnd: 48_000,
      sortOrder: 12,
    },
  ],
} as const;

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
    const zoneId = zone[0].id;

    let providerId = "";
    let locationId = "";

    const existing = await sql<{ id: string; location_id: string }[]>`
      SELECT p.id, pl.id AS location_id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = ${MINIMART.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Minimart already seeded:", MINIMART.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${MINIMART.slug}, ${MINIMART.brandName}, ${"MINIMART"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create minimart");
        providerId = provider.id;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${MINIMART.locationSlug},
            ${MINIMART.displayName},
            ${"ACTIVE"},
            ${MINIMART.address},
            ${MINIMART.lat},
            ${MINIMART.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create minimart location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zoneId}::uuid, ${"ACTIVE"})
        `;

        await tx`
          INSERT INTO provider_live_status (
            provider_location_id, status, message
          ) VALUES (
            ${location.id}::uuid,
            ${"OPEN"},
            ${MINIMART.liveMessage}
          )
        `;
      });
    }

    await sql`
      INSERT INTO provider_profiles (provider_id, tagline)
      VALUES (${providerId}::uuid, ${MINIMART.tagline})
      ON CONFLICT (provider_id) DO UPDATE
        SET tagline = ${MINIMART.tagline}
    `;

    await sql`
      UPDATE providers
      SET primary_category_id = ${MINIMART.primaryCategoryId}::uuid,
          commerce_model = 'RETAIL_STORE'
      WHERE id = ${providerId}::uuid
    `;

    await sql`
      UPDATE provider_live_status
      SET message = ${MINIMART.liveMessage}
      WHERE provider_location_id = ${locationId}::uuid
    `;

    if (MINIMART.legacySlugs.length > 0) {
      await sql`
        UPDATE offerings
        SET status = 'ARCHIVED', updated_at = now()
        WHERE provider_id = ${providerId}::uuid
          AND slug IN ${sql(MINIMART.legacySlugs)}
      `;
    }

    for (const item of MINIMART.offerings) {
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
            sort_order, unit, category_id
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${"PRODUCT"},
            ${"ACTIVE"},
            ${item.sortOrder},
            ${item.unit},
            ${item.categoryId}::uuid
          )
          RETURNING id
        `;
        offeringId = created?.id;
      } else {
        await sql`
          UPDATE offerings
          SET name = ${item.name},
              description = ${item.description},
              offering_type = 'PRODUCT',
              status = 'ACTIVE',
              sort_order = ${item.sortOrder},
              unit = ${item.unit},
              category_id = ${item.categoryId}::uuid,
              fulfillment_mode = NULL,
              updated_at = now()
          WHERE id = ${offeringId}::uuid
        `;
      }
      if (!offeringId) continue;

      await sql`
        INSERT INTO offering_prices (
          offering_id, provider_location_id, amount_vnd, pricing_kind
        ) VALUES (
          ${offeringId}::uuid,
          ${locationId}::uuid,
          ${item.priceVnd},
          ${"FIXED"}
        )
        ON CONFLICT DO NOTHING
      `;
      await sql`
        UPDATE offering_prices
        SET amount_vnd = ${item.priceVnd},
            pricing_kind = 'FIXED'
        WHERE offering_id = ${offeringId}::uuid
          AND provider_location_id = ${locationId}::uuid
      `;

      if ("prep" in item && item.prep) {
        const existingGroup = await sql<{ id: string }[]>`
          SELECT id FROM offering_option_groups
          WHERE offering_id = ${offeringId}::uuid AND name = 'Sơ chế'
          LIMIT 1
        `;
        if (!existingGroup[0]) {
          const [group] = await sql<{ id: string }[]>`
            INSERT INTO offering_option_groups (
              offering_id, name, selection, required, min_select, max_select, sort_order
            ) VALUES (
              ${offeringId}::uuid, 'Sơ chế', 'SINGLE', true, 1, 1, 0
            )
            RETURNING id
          `;
          if (group) {
            await sql`
              INSERT INTO offering_options (group_id, name, price_delta_vnd, sort_order)
              VALUES
                (${group.id}::uuid, 'Để nguyên', 0, 0),
                (${group.id}::uuid, 'Thái lát', 0, 1),
                (${group.id}::uuid, 'Xay', 5000, 2)
            `;
          }
        }
      }
      console.log("  + offering:", item.name);
    }

    const ownerId = await ensureUser(sql, MINIMART.ownerPhone, MINIMART.ownerName);

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

    console.log(
      `Minimart login: ${MINIMART.ownerPhone} (UI: 0${MINIMART.ownerPhone.slice(3)}) → ${MINIMART.brandName}`,
    );
    console.log("✓ Minimart seed done (ĐI CHỢ — Kim Văn)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
