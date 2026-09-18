import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const TRANSPORT = {
  slug: "xe-kim-van",
  brandName: "XE KIM VĂN",
  locationSlug: "xe-kim-van-ct12",
  displayName: "Xe Kim Văn — CT12",
  tagline: "Đưa đón sân bay · về quê · du lịch · học sinh — gọi hỏi lịch & giá",
  address: "Chân đế CT12 Kim Văn, Hoàng Mai",
  lat: 20.9885,
  lng: 105.8425,
  ownerPhone: "+84908888016",
  ownerName: "Xe Kim Văn",
  liveMessage: "Đang nhận chuyến — gọi trước để chốt giờ đón",
  offerings: [
    {
      slug: "san-bay",
      name: "Đưa đón sân bay",
      description: "Nội Bài / Gia Lâm — đón tận nhà hoặc sảnh CT",
      referencePriceVnd: 350_000,
      pricingKind: "FROM",
      sortOrder: 1,
    },
    {
      slug: "ve-que",
      name: "Về quê / liên tỉnh",
      description: "Xe 4–7 chỗ — báo điểm đến & giờ xuất phát",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 2,
    },
    {
      slug: "du-lich",
      name: "Du lịch / thuê xe có tài xế",
      description: "Trong ngày hoặc nhiều ngày — trao đổi lộ trình",
      referencePriceVnd: 0,
      pricingKind: "QUOTE_REQUIRED",
      sortOrder: 3,
    },
    {
      slug: "dua-don-hoc",
      name: "Đưa đón đi học",
      description: "Theo tháng / theo tuần — tuyến cố định quanh Zone",
      referencePriceVnd: 1_500_000,
      pricingKind: "FROM",
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
      WHERE p.slug = ${TRANSPORT.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Transport already seeded:", TRANSPORT.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${TRANSPORT.slug}, ${TRANSPORT.brandName}, ${"TRANSPORT_PROVIDER"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create transport provider");
        providerId = provider.id;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${TRANSPORT.locationSlug},
            ${TRANSPORT.displayName},
            ${"ACTIVE"},
            ${TRANSPORT.address},
            ${TRANSPORT.lat},
            ${TRANSPORT.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create transport location");
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
            ${TRANSPORT.liveMessage}
          )
        `;
      });
    }

    await sql`
      INSERT INTO provider_profiles (provider_id, tagline)
      VALUES (${providerId}::uuid, ${TRANSPORT.tagline})
      ON CONFLICT (provider_id) DO UPDATE
        SET tagline = ${TRANSPORT.tagline}
    `;

    for (const item of TRANSPORT.offerings) {
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

    const ownerId = await ensureUser(sql, TRANSPORT.ownerPhone, TRANSPORT.ownerName);

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
      `Transport login: ${TRANSPORT.ownerPhone} (UI: 0${TRANSPORT.ownerPhone.slice(3)}) → ${TRANSPORT.brandName}`,
    );
    console.log("✓ Transport seed done (XE ĐƯA ĐÓN — Kim Văn)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
