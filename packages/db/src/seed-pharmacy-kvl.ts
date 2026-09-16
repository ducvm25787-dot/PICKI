import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const PHARMACY = {
  slug: "nha-thuoc-kim-van",
  brandName: "NHÀ THUỐC KIM VĂN",
  locationSlug: "nha-thuoc-kim-van-ct12",
  displayName: "Nhà thuốc Kim Văn — CT12",
  tagline: "Hiệu gần nhà — gọi hỏi còn hàng rồi qua lấy · hữu ích đêm muộn",
  address: "Chân đế CT12 Kim Văn, Hoàng Mai",
  lat: 20.9882,
  lng: 105.8422,
  licenseNumber: "GPP-09012/HNO-GPP",
  ownerPhone: "+84908888012",
  ownerName: "Nhà thuốc Kim Văn",
  liveMessage: "Đang mở — gọi trước nếu cần thuốc đặc biệt",
  offerings: [
    {
      slug: "otc-cam-cum",
      name: "Thuốc cảm / OTC thông dụng",
      description: "Gọi hỏi còn hàng & giá — qua lấy tại hiệu",
      referencePriceVnd: 50_000,
      pricingKind: "FROM",
      sortOrder: 1,
    },
    {
      slug: "bang-gac-y-te",
      name: "Băng gạc / vật tư y tế",
      description: "Băng, gạc, nước muối… hỏi còn rồi qua lấy",
      referencePriceVnd: 30_000,
      pricingKind: "FROM",
      sortOrder: 2,
    },
    {
      slug: "sua-vitamin",
      name: "Sữa / vitamin",
      description: "Gọi hỏi loại đang có",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 3,
    },
    {
      slug: "thuoc-ke-don",
      name: "Thuốc theo đơn",
      description: "Mang đơn / gọi hỏi — không đặt mua trên Picki",
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
      WHERE p.slug = ${PHARMACY.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Pharmacy already seeded:", PHARMACY.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${PHARMACY.slug}, ${PHARMACY.brandName}, ${"PHARMACY"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create pharmacy");
        providerId = provider.id;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${PHARMACY.locationSlug},
            ${PHARMACY.displayName},
            ${"ACTIVE"},
            ${PHARMACY.address},
            ${PHARMACY.lat},
            ${PHARMACY.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create pharmacy location");
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
            ${PHARMACY.liveMessage}
          )
        `;
      });
    }

    await sql`
      INSERT INTO provider_profiles (provider_id, tagline, license_number, license_verified_at)
      VALUES (${providerId}::uuid, ${PHARMACY.tagline}, ${PHARMACY.licenseNumber}, now())
      ON CONFLICT (provider_id) DO UPDATE
        SET tagline = ${PHARMACY.tagline},
            license_number = ${PHARMACY.licenseNumber},
            license_verified_at = now()
    `;

    for (const item of PHARMACY.offerings) {
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

    const ownerId = await ensureUser(sql, PHARMACY.ownerPhone, PHARMACY.ownerName);

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
      `Pharmacy login: ${PHARMACY.ownerPhone} (UI: 0${PHARMACY.ownerPhone.slice(3)}) → ${PHARMACY.brandName}`,
    );
    console.log("✓ Pharmacy seed done (NHÀ THUỐC — Kim Văn)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
