import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

/** Food moment tags for S15–S18 discovery blocks */
const OFFERING_TAGS: Record<string, { foodMoment: string; fulfillmentMode: string; paymentPolicy: string }> = {
  "com-suon": { foodMoment: "LUNCH", fulfillmentMode: "INSTANT", paymentPolicy: "COD_ALLOWED" },
  "com-bi": { foodMoment: "LUNCH", fulfillmentMode: "INSTANT", paymentPolicy: "COD_ALLOWED" },
  "com-cha": { foodMoment: "FAMILY_MEAL", fulfillmentMode: "INSTANT", paymentPolicy: "PREPAY_REQUIRED" },
  "pho-tai": { foodMoment: "BREAKFAST_INSTANT", fulfillmentMode: "INSTANT", paymentPolicy: "PREPAY_PREFERRED" },
  "pho-nam": { foodMoment: "BREAKFAST_INSTANT", fulfillmentMode: "INSTANT", paymentPolicy: "PREPAY_PREFERRED" },
  "pho-dac-biet": { foodMoment: "DINNER", fulfillmentMode: "INSTANT", paymentPolicy: "PREPAY_PREFERRED" },
  "bun-cha": { foodMoment: "LUNCH", fulfillmentMode: "PREORDER", paymentPolicy: "PREPAY_REQUIRED" },
  "nem-ran": { foodMoment: "SNACK", fulfillmentMode: "INSTANT", paymentPolicy: "COD_ALLOWED" },
};

const LIVE_ETA: Record<string, { prep: number; eta: number; message: string }> = {
  "com-tam-kim-van": { prep: 12, eta: 25, message: "Cơm tấm — ship nhanh CT12" },
  "pho-ba-hang": { prep: 8, eta: 20, message: "Phở sáng — nước dùng ninh xương" },
  "bun-cha-ha-noi-kvl": { prep: 20, eta: 35, message: "Home cook — đặt trước 30 phút" },
};

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  try {
    for (const [slug, tags] of Object.entries(OFFERING_TAGS)) {
      await sql`
        UPDATE offerings SET
          food_moment = ${tags.foodMoment},
          fulfillment_mode = ${tags.fulfillmentMode},
          payment_policy = ${tags.paymentPolicy},
          updated_at = now()
        WHERE slug = ${slug}
      `;
    }

    for (const [providerSlug, live] of Object.entries(LIVE_ETA)) {
      await sql`
        UPDATE provider_live_status pls SET
          prep_minutes = ${live.prep},
          eta_minutes = ${live.eta},
          message = ${live.message},
          updated_at = now()
        FROM provider_locations pl
        INNER JOIN providers p ON p.id = pl.provider_id
        WHERE pls.provider_location_id = pl.id AND p.slug = ${providerSlug}
      `;
    }

    const comTam = await sql<{ offering_id: string; location_id: string }[]>`
      SELECT o.id AS offering_id, pl.id AS location_id
      FROM offerings o
      INNER JOIN providers p ON p.id = o.provider_id
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = 'com-tam-kim-van' AND o.slug = 'com-suon'
      LIMIT 1
    `;
    if (comTam[0]) {
      await sql`
        INSERT INTO daily_specials (
          offering_id, provider_location_id, available_date,
          quantity_total, quantity_remaining
        ) VALUES (
          ${comTam[0].offering_id}::uuid,
          ${comTam[0].location_id}::uuid,
          CURRENT_DATE,
          30,
          18
        )
        ON CONFLICT (offering_id, provider_location_id, available_date) DO UPDATE SET
          quantity_remaining = EXCLUDED.quantity_remaining
      `;
    }

    const bunCha = await sql<{ offering_id: string; location_id: string }[]>`
      SELECT o.id AS offering_id, pl.id AS location_id
      FROM offerings o
      INNER JOIN providers p ON p.id = o.provider_id
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = 'bun-cha-ha-noi-kvl' AND o.slug = 'nem-ran'
      LIMIT 1
    `;
    if (bunCha[0]) {
      await sql`
        INSERT INTO daily_specials (
          offering_id, provider_location_id, available_date,
          quantity_total, quantity_remaining
        ) VALUES (
          ${bunCha[0].offering_id}::uuid,
          ${bunCha[0].location_id}::uuid,
          CURRENT_DATE,
          20,
          7
        )
        ON CONFLICT (offering_id, provider_location_id, available_date) DO UPDATE SET
          quantity_remaining = EXCLUDED.quantity_remaining
      `;
    }

    console.log("Seeded food discovery tags, live ETA, daily specials (S11–S18)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
