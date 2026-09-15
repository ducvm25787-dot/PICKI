import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const CUSTOMER_PHONE = "+84901234567";

const LISTINGS = [
  {
    listingNumber: "CL-DEMO-001",
    listingType: "RESALE" as const,
    title: "Xe đẩy em bé Aprica",
    description: "Dùng 1 năm, còn tốt — CT12 giao tận cửa hoặc lấy tại sảnh.",
    priceVnd: 850_000,
    condition: "GOOD" as const,
    locationLabel: "CT12 — tầng 15",
    photoUrl: null,
  },
  {
    listingNumber: "CL-DEMO-002",
    listingType: "RESALE" as const,
    title: "Bàn học cho bé",
    description: "Bàn gỗ cao su, kèm ghế — tự lắp trong 10 phút.",
    priceVnd: 350_000,
    condition: "LIKE_NEW" as const,
    locationLabel: "CT11 — tầng 8",
    photoUrl: null,
  },
  {
    listingNumber: "CL-DEMO-003",
    listingType: "GIVE_AWAY" as const,
    title: "Quần áo trẻ em 2–3 tuổi",
    description: "Khoảng 15 bộ, giặt sạch — ai cần inbox lấy miễn phí.",
    priceVnd: null,
    condition: "GOOD" as const,
    locationLabel: "CT12 — tầng 6",
    photoUrl: null,
  },
  {
    listingNumber: "CL-DEMO-004",
    listingType: "GIVE_AWAY" as const,
    title: "Sách tiếng Anh cũ (lớp 3–5)",
    description: "Oxford Reading Tree + sách luyện đọc — tặng cho bé mới chuyển tới khu.",
    priceVnd: null,
    condition: "FAIR" as const,
    locationLabel: "CT10 — tầng 3",
    photoUrl: null,
  },
] as const;

async function userIdForPhone(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
): Promise<string | undefined> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE phone = ${phone} LIMIT 1
  `;
  return rows[0]?.id;
}

async function zoneIdForSlug(
  sql: ReturnType<typeof createPickiDb>["sql"],
  slug: string,
): Promise<string | undefined> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM zones WHERE slug = ${slug} LIMIT 1
  `;
  return rows[0]?.id;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  const zoneId = await zoneIdForSlug(sql, KVL_SLUG);
  if (!zoneId) {
    console.error(`Zone ${KVL_SLUG} not found — chạy seed:ops trước`);
    process.exit(1);
  }

  const sellerId = await userIdForPhone(sql, CUSTOMER_PHONE);
  if (!sellerId) {
    console.error(`Customer ${CUSTOMER_PHONE} not found — chạy seed:ops trước`);
    process.exit(1);
  }

  for (const listing of LISTINGS) {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM classified_listings WHERE listing_number = ${listing.listingNumber} LIMIT 1
    `;
    if (existing[0]) {
      console.log(`  skip ${listing.listingNumber} (exists)`);
      continue;
    }

    await sql`
      INSERT INTO classified_listings (
        listing_number, zone_id, seller_user_id, listing_type, status,
        title, description, price_vnd, condition, photo_url, location_label
      ) VALUES (
        ${listing.listingNumber}, ${zoneId}, ${sellerId}, ${listing.listingType}, 'AVAILABLE',
        ${listing.title}, ${listing.description}, ${listing.priceVnd}, ${listing.condition},
        ${listing.photoUrl}, ${listing.locationLabel}
      )
    `;
    console.log(`  + ${listing.listingNumber}: ${listing.title}`);
  }

  console.log("✓ Classified seed done (GÓC KHU MÌNH — Thanh lý + Cho tặng)");
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
