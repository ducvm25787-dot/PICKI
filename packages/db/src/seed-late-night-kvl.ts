import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const PHO_SLUG = "pho-ga-kim-van";

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

    const loc = await sql<{ id: string }[]>`
      SELECT pl.id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = ${PHO_SLUG}
      LIMIT 1
    `;
    if (!loc[0]) {
      console.error("pho-ga-kim-van missing — run bash scripts/db-seed-breakfast.sh first");
      process.exit(1);
    }

    await sql`
      INSERT INTO late_night_provider_settings (
        provider_location_id, enabled, starts_at, ends_at
      ) VALUES (
        ${loc[0].id}::uuid, true, '20:30'::time, '02:00'::time
      )
      ON CONFLICT (provider_location_id) DO UPDATE SET
        enabled = true,
        starts_at = '20:30'::time,
        ends_at = '02:00'::time,
        updated_at = now()
    `;

    await sql`
      INSERT INTO provider_live_status (provider_location_id, status, updated_at)
      VALUES (${loc[0].id}::uuid, 'OPEN', now())
      ON CONFLICT (provider_location_id) DO UPDATE SET
        status = 'OPEN',
        updated_at = now()
    `;

    console.log("Late night seed ok");
    console.log("  Phở Gà Kim Văn · Bán khuya 20:30–02:00 · live OPEN");
    console.log("  Customer: /late-night · Provider login 0908888015 → Trạng thái");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
