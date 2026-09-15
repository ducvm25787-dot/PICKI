import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

type Offering = {
  slug: string;
  name: string;
  description: string;
  referencePriceVnd: number | null;
  pricingKind: string;
  fulfillmentMode: "CUSTOMER_VISIT" | "CONTACT_ONLY";
  sortOrder: number;
};

type Clinic = {
  slug: string;
  brandName: string;
  locationSlug: string;
  displayName: string;
  tagline: string;
  address: string;
  lat: number;
  lng: number;
  licenseNumber: string;
  ownerPhone: string;
  ownerName: string;
  waitMinutes: number;
  liveMessage: string;
  offerings: Offering[];
};

const CLINICS: Clinic[] = [
  {
    slug: "da-khoa-kim-van",
    brandName: "PHÒNG KHÁM ĐA KHOA KIM VĂN",
    locationSlug: "da-khoa-kim-van-ct12",
    displayName: "Đa khoa Kim Văn — CT12",
    tagline: "Đa khoa, Nhi, Tai mũi họng, Mắt, Da liễu, Xương khớp — xem chờ live trước khi tới",
    address: "CT12 Kim Văn, Hoàng Mai",
    lat: 20.9885,
    lng: 105.8419,
    licenseNumber: "GPHĐ-01234/HNO-GPHD",
    ownerPhone: "+84908888009",
    ownerName: "Phòng khám Đa khoa Kim Văn",
    waitMinutes: 30,
    liveMessage: "Đang khám — chờ khoảng 30 phút",
    offerings: [
      {
        slug: "kham-da-khoa",
        name: "Khám đa khoa",
        description: "Khám tổng quát — xem đông vắng rồi báo sắp tới",
        referencePriceVnd: 150_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 1,
      },
      {
        slug: "kham-nhi",
        name: "Khám Nhi",
        description: "Khám cho bé — báo sắp tới để phòng khám cân ca",
        referencePriceVnd: 150_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 2,
      },
      {
        slug: "tai-mui-hong",
        name: "Tai mũi họng",
        description: "Khám chuyên khoa tai mũi họng",
        referencePriceVnd: 200_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 3,
      },
      {
        slug: "kham-mat",
        name: "Khám Mắt",
        description: "Đo thị lực, khám mắt cơ bản",
        referencePriceVnd: 150_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 4,
      },
      {
        slug: "da-lieu",
        name: "Da liễu",
        description: "Khám da liễu",
        referencePriceVnd: 200_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 5,
      },
      {
        slug: "xuong-khop",
        name: "Xương khớp",
        description: "Khám cơ xương khớp",
        referencePriceVnd: 250_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 6,
      },
      {
        slug: "phu-san",
        name: "Phụ sản",
        description: "Khám phụ sản — gọi/Zalo phòng khám để trao đổi trước",
        referencePriceVnd: null,
        pricingKind: "QUOTE_REQUIRED",
        fulfillmentMode: "CONTACT_ONLY",
        sortOrder: 7,
      },
    ],
  },
  {
    slug: "nha-khoa-kim-van",
    brandName: "NHA KHOA KIM VĂN",
    locationSlug: "nha-khoa-kim-van-ct11",
    displayName: "Nha khoa Kim Văn — CT11",
    tagline: "Răng hàm mặt — khám, lấy cao răng xem chờ live · niềng/răng sứ liên hệ trực tiếp",
    address: "CT11 Kim Văn, Hoàng Mai",
    lat: 20.9878,
    lng: 105.8431,
    licenseNumber: "GPHĐ-04567/HNO-GPHD",
    ownerPhone: "+84908888010",
    ownerName: "Nha khoa Kim Văn",
    waitMinutes: 15,
    liveMessage: "Còn ghế trống — chờ khoảng 15 phút",
    offerings: [
      {
        slug: "kham-rang",
        name: "Khám răng tổng quát",
        description: "Khám và tư vấn — báo sắp tới để giữ lượt",
        referencePriceVnd: 100_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 1,
      },
      {
        slug: "lay-cao-rang",
        name: "Lấy cao răng",
        description: "Vệ sinh răng — khoảng 30 phút",
        referencePriceVnd: 300_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 2,
      },
      {
        slug: "tram-rang",
        name: "Trám răng",
        description: "Trám răng sâu — xem chờ live trước khi tới",
        referencePriceVnd: 400_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 3,
      },
      {
        slug: "nieng-rang-rang-su",
        name: "Niềng răng / Răng sứ",
        description: "Điều trị dài ngày — gọi/Zalo phòng khám để khám và báo giá",
        referencePriceVnd: null,
        pricingKind: "QUOTE_REQUIRED",
        fulfillmentMode: "CONTACT_ONLY",
        sortOrder: 4,
      },
    ],
  },
  {
    slug: "dong-y-kim-van",
    brandName: "ĐÔNG Y TRỊ LIỆU KIM VĂN",
    locationSlug: "dong-y-kim-van-ct10",
    displayName: "Đông y Kim Văn — CT10",
    tagline: "Đông y trị liệu — châm cứu, bấm huyệt, trị liệu xương khớp",
    address: "CT10 Kim Văn, Hoàng Mai",
    lat: 20.9891,
    lng: 105.8409,
    licenseNumber: "GPHĐ-07890/HNO-GPHD",
    ownerPhone: "+84908888011",
    ownerName: "Đông y Kim Văn",
    waitMinutes: 0,
    liveMessage: "Vào được ngay",
    offerings: [
      {
        slug: "cham-cuu",
        name: "Châm cứu",
        description: "Một buổi trị liệu — báo sắp tới để chuẩn bị giường",
        referencePriceVnd: 200_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 1,
      },
      {
        slug: "bam-huyet-xoa-bop",
        name: "Bấm huyệt / xoa bóp",
        description: "Trị liệu 45–60 phút",
        referencePriceVnd: 250_000,
        pricingKind: "FROM",
        fulfillmentMode: "CUSTOMER_VISIT",
        sortOrder: 2,
      },
      {
        slug: "tri-lieu-xuong-khop",
        name: "Trị liệu xương khớp",
        description: "Theo liệu trình — gọi/Zalo để khám và trao đổi trực tiếp",
        referencePriceVnd: null,
        pricingKind: "QUOTE_REQUIRED",
        fulfillmentMode: "CONTACT_ONLY",
        sortOrder: 3,
      },
    ],
  },
];

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

async function seedClinic(
  sql: ReturnType<typeof createPickiDb>["sql"],
  zoneId: string,
  clinic: Clinic,
) {
  let providerId = "";
  let locationId = "";

  const existing = await sql<{ id: string; location_id: string }[]>`
    SELECT p.id, pl.id AS location_id
    FROM providers p
    INNER JOIN provider_locations pl ON pl.provider_id = p.id
    WHERE p.slug = ${clinic.slug}
    LIMIT 1
  `;

  if (existing[0]) {
    providerId = existing[0].id;
    locationId = existing[0].location_id;
    console.log("Clinic already seeded:", clinic.slug);
  } else {
    await sql.begin(async (tx) => {
      const [provider] = await tx<{ id: string }[]>`
        INSERT INTO providers (slug, brand_name, provider_type, status)
        VALUES (${clinic.slug}, ${clinic.brandName}, ${"HEALTH_PROVIDER"}, ${"ACTIVE"})
        RETURNING id
      `;
      if (!provider) throw new Error("Failed to create clinic provider");
      providerId = provider.id;

      const [location] = await tx<{ id: string }[]>`
        INSERT INTO provider_locations (
          provider_id, slug, display_name, status,
          address_line, lat, lng
        ) VALUES (
          ${provider.id}::uuid,
          ${clinic.locationSlug},
          ${clinic.displayName},
          ${"ACTIVE"},
          ${clinic.address},
          ${clinic.lat},
          ${clinic.lng}
        )
        RETURNING id
      `;
      if (!location) throw new Error("Failed to create clinic location");
      locationId = location.id;

      await tx`
        INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
        VALUES (${location.id}::uuid, ${zoneId}::uuid, ${"ACTIVE"})
      `;

      await tx`
        INSERT INTO provider_live_status (
          provider_location_id, status, message, estimated_wait_minutes
        ) VALUES (
          ${location.id}::uuid,
          ${"OPEN"},
          ${clinic.liveMessage},
          ${clinic.waitMinutes}
        )
      `;
    });
  }

  // Giấy phép hoạt động đã verify — điều kiện để phòng khám hiện trên discovery (§86)
  await sql`
    INSERT INTO provider_profiles (provider_id, tagline, license_number, license_verified_at)
    VALUES (${providerId}::uuid, ${clinic.tagline}, ${clinic.licenseNumber}, now())
    ON CONFLICT (provider_id) DO UPDATE
      SET tagline = ${clinic.tagline},
          license_number = ${clinic.licenseNumber},
          license_verified_at = now()
  `;

  for (const item of clinic.offerings) {
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

    // Dịch vụ báo giá vẫn cần một dòng giá (amount 0) để hiện trong menu
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
    console.log("  + offering:", item.name);
  }

  const ownerId = await ensureUser(sql, clinic.ownerPhone, clinic.ownerName);

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
    `Clinic owner login: ${clinic.ownerPhone} (UI: 0${clinic.ownerPhone.slice(3)}) → ${clinic.brandName}`,
  );
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

    for (const clinic of CLINICS) {
      await seedClinic(sql, zone[0].id, clinic);
    }

    console.log("✓ Health seed done (PHÒNG KHÁM — Kim Văn)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
