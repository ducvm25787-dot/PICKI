import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const EDU_OWNER_PHONE = "+84986237350";

const EDU = {
  slug: "saomai-edu-kim-van",
  brandName: "SaomaiEdu",
  locationSlug: "saomai-edu-kim-van",
  displayName: "SaomaiEdu — CT12",
  tagline: "Gia sư, học thêm, lớp trẻ em — tại nhà, online, tại lớp",
  address: "CT12 Kim Văn, Hoàng Mai",
  lat: 20.9885,
  lng: 105.842,
} as const;

const OFFERINGS = [
  {
    slug: "gia-su-toan-lop-9",
    name: "Gia sư Toán lớp 9",
    description: "Ôn thi vào 10, củng cố kiến thức — giáo viên đến tận nhà",
    referencePriceVnd: 250_000,
    pricingKind: "FROM",
    fulfillmentMode: "PROVIDER_VISIT",
    educationSubject: "Toán",
    educationGrade: "Lớp 9",
    sortOrder: 1,
  },
  {
    slug: "tieng-anh-online-6-8",
    name: "Tiếng Anh online lớp 6–8",
    description: "Giao tiếp và ngữ pháp — học qua Zoom/Zalo Meet",
    referencePriceVnd: 200_000,
    pricingKind: "FROM",
    fulfillmentMode: "ONLINE",
    educationSubject: "Tiếng Anh",
    educationGrade: "Lớp 6–8",
    sortOrder: 2,
  },
  {
    slug: "lop-toan-tre-em",
    name: "Lớp Toán trẻ em tại lớp",
    description: "Nhóm 4–6 em, tại lớp SaomaiEdu CT12",
    referencePriceVnd: 180_000,
    pricingKind: "FROM",
    fulfillmentMode: "CUSTOMER_VISIT",
    educationSubject: "Toán",
    educationGrade: "Lớp 3–5",
    sortOrder: 3,
  },
  {
    slug: "buoi-hoc-thu",
    name: "Buổi học thử (30 phút)",
    description: "Làm quen giáo viên và chương trình — miễn phí hoặc giá thử",
    referencePriceVnd: 0,
    pricingKind: "FIXED",
    fulfillmentMode: "ONLINE",
    educationSubject: "Tư vấn",
    educationGrade: "Mọi lớp",
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
      WHERE p.slug = ${EDU.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Education provider already seeded:", EDU.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${EDU.slug}, ${EDU.brandName}, ${"EDUCATION_PROVIDER"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create education provider");
        providerId = provider.id;

        await tx`
          INSERT INTO provider_profiles (provider_id, tagline)
          VALUES (${provider.id}::uuid, ${EDU.tagline})
        `;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status,
            address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${EDU.locationSlug},
            ${EDU.displayName},
            ${"ACTIVE"},
            ${EDU.address},
            ${EDU.lat},
            ${EDU.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create education location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zone[0]!.id}::uuid, ${"ACTIVE"})
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
            sort_order, fulfillment_mode, education_subject, education_grade
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${"BOOKING"},
            ${"ACTIVE"},
            ${item.sortOrder},
            ${item.fulfillmentMode},
            ${item.educationSubject},
            ${item.educationGrade}
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
      console.log("Seeded education offering:", item.name);
    }

    const ownerId = await ensureUser(sql, EDU_OWNER_PHONE, "SaomaiEdu");

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

    console.log("Education owner login:", EDU_OWNER_PHONE, "(UI: 0986237350) → SaomaiEdu");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
