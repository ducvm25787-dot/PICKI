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

    // Chỉ 1 tin ACTIVE housing / user (unique index)
    const active = await sql<{ id: string }[]>`
      SELECT id FROM classified_listings
      WHERE seller_user_id = ${sellerId}::uuid
        AND listing_type IN ('CHO_THUE', 'O_GHEP')
        AND status = 'AVAILABLE'
      LIMIT 1
    `;

    if (!active[0]) {
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);
      await sql`
        INSERT INTO classified_listings (
          listing_number, zone_id, seller_user_id, listing_type, status,
          title, description, price_vnd, location_label, photo_urls, expires_at
        ) VALUES (
          ${"HS-DEMO-001"},
          ${zoneId}::uuid,
          ${sellerId}::uuid,
          ${"CHO_THUE"},
          ${"AVAILABLE"},
          ${"Cho thuê studio CT12 — full nội thất"},
          ${"Studio ~28m², máy lạnh, giường tủ. Liên hệ chat — không đặt cọc trên Picki."},
          ${4_500_000},
          ${"CT12 Kim Văn"},
          ${JSON.stringify([])}::jsonb,
          ${expires.toISOString()}
        )
      `;
      console.log("  + HS-DEMO-001 CHO_THUE (AVAILABLE)");
    } else {
      console.log("  skip active housing (already have 1 AVAILABLE)");
    }

    const archived = await sql<{ id: string }[]>`
      SELECT id FROM classified_listings WHERE listing_number = ${"HS-DEMO-002"} LIMIT 1
    `;
    if (!archived[0]) {
      // created_at tháng trước — không chiếm quota tháng hiện tại
      const pastExpire = new Date();
      pastExpire.setMonth(pastExpire.getMonth() - 1);
      const pastCreated = new Date();
      pastCreated.setMonth(pastCreated.getMonth() - 1);
      await sql`
        INSERT INTO classified_listings (
          listing_number, zone_id, seller_user_id, listing_type, status,
          title, description, price_vnd, location_label, photo_urls, expires_at,
          created_at, updated_at
        ) VALUES (
          ${"HS-DEMO-002"},
          ${zoneId}::uuid,
          ${sellerId}::uuid,
          ${"O_GHEP"},
          ${"ARCHIVED"},
          ${"Tìm bạn ở ghép CT11 — nữ"},
          ${"Demo tin đã hết hạn / đã ẩn (tháng trước — không chiếm quota)."},
          ${2_500_000},
          ${"CT11 Kim Văn"},
          ${JSON.stringify([])}::jsonb,
          ${pastExpire.toISOString()},
          ${pastCreated.toISOString()},
          ${pastCreated.toISOString()}
        )
      `;
      console.log("  + HS-DEMO-002 O_GHEP (ARCHIVED, tháng trước)");
    } else {
      console.log("  skip HS-DEMO-002 (exists)");
    }

    console.log("✓ Housing seed done (Cho thuê / Ở ghép — ADR-042)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
