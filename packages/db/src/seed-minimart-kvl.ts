import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const MINIMART = {
  slug: "tap-hoa-kim-van",
  brandName: "TẠP HÓA KIM VĂN",
  locationSlug: "tap-hoa-kim-van-ct12",
  displayName: "Tạp hóa Kim Văn — CT12",
  tagline: "Gạo, mì, sữa, bỉm — gọi hỏi còn hàng rồi qua lấy · mở cả đêm muộn",
  address: "Chân đế CT12 Kim Văn, Hoàng Mai",
  lat: 20.98835,
  lng: 105.84235,
  ownerPhone: "+84908888013",
  ownerName: "Tạp hóa Kim Văn",
  liveMessage: "Đang mở — gọi trước nếu cần hàng số lượng lớn",
  offerings: [
    {
      slug: "gao-mi-gia-vi",
      name: "Gạo / mì / gia vị",
      description: "Gọi hỏi còn hàng & giá — qua lấy tại quán",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 1,
    },
    {
      slug: "sua-bim",
      name: "Sữa / bỉm",
      description: "Hữu ích đêm muộn — hỏi còn rồi qua lấy",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 2,
    },
    {
      slug: "nuoc-uong-snack",
      name: "Nước uống / snack",
      description: "Gọi hỏi loại đang có",
      referencePriceVnd: 15_000,
      pricingKind: "FROM",
      sortOrder: 3,
    },
    {
      slug: "hang-gia-dung",
      name: "Hàng gia dụng nhỏ",
      description: "Pin, bóng đèn, túi… hỏi còn rồi qua lấy",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 4,
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
            sort_order, fulfillment_mode
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${"SERVICE"},
            ${"ACTIVE"},
            ${item.sortOrder},
            ${"CONTACT_ONLY"}
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
