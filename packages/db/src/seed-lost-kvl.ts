import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const CUSTOMER_PHONE = "+84901234567";

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

    const sellerId = await userIdForPhone(sql, CUSTOMER_PHONE);
    if (!sellerId) {
      console.error(`Customer ${CUSTOMER_PHONE} missing — run seed:ops first`);
      process.exit(1);
    }

    const expires = new Date();
    expires.setDate(expires.getDate() + 14);

    const lostDemo = await sql<{ id: string }[]>`
      SELECT id FROM classified_listings WHERE listing_number = ${"LF-DEMO-001"} LIMIT 1
    `;
    if (!lostDemo[0]) {
      await sql`
        INSERT INTO classified_listings (
          listing_number, zone_id, seller_user_id, listing_type, status,
          title, description, price_vnd, location_label, photo_urls, expires_at
        ) VALUES (
          ${"LF-DEMO-001"},
          ${zoneId}::uuid,
          ${sellerId}::uuid,
          ${"LOST_FOUND"},
          ${"AVAILABLE"},
          ${"Nhặt được chìa khóa xe gần sảnh CT12"},
          ${"Chùm chìa có móc gấu nâu. Để lại sảnh hoặc chat nhận lại — không mua bán."},
          ${null},
          ${"Sảnh CT12 Kim Văn"},
          ${JSON.stringify([])}::jsonb,
          ${expires.toISOString()}
        )
      `;
      console.log("  + LF-DEMO-001 LOST_FOUND (AVAILABLE)");
    } else {
      console.log("  skip LF-DEMO-001 (exists)");
    }

    const petDemo = await sql<{ id: string }[]>`
      SELECT id FROM classified_listings WHERE listing_number = ${"LF-DEMO-002"} LIMIT 1
    `;
    if (!petDemo[0]) {
      await sql`
        INSERT INTO classified_listings (
          listing_number, zone_id, seller_user_id, listing_type, status,
          title, description, price_vnd, location_label, photo_urls, expires_at
        ) VALUES (
          ${"LF-DEMO-002"},
          ${zoneId}::uuid,
          ${sellerId}::uuid,
          ${"PET_LOST"},
          ${"AVAILABLE"},
          ${"Mất mèo vàng đực — khu CT11"},
          ${"Mèo vàng mắt xanh, đeo vòng xanh. Mất tối qua quanh CT11. Chat nếu thấy."},
          ${null},
          ${"CT11 Kim Văn"},
          ${JSON.stringify(["https://placehold.co/300x300/png?text=Pet"])}::jsonb,
          ${expires.toISOString()}
        )
      `;
      console.log("  + LF-DEMO-002 PET_LOST (AVAILABLE)");
    } else {
      console.log("  skip LF-DEMO-002 (exists)");
    }

    console.log("✓ Lost/Pet Lost seed done (ADR-045)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
