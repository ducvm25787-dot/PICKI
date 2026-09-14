import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

type MenuItem = {
  slug: string;
  name: string;
  description?: string;
  amountVnd: number;
  sortOrder: number;
};

const MENUS: Record<string, MenuItem[]> = {
  "com-tam-kim-van": [
    { slug: "com-suon", name: "Cơm tấm sườn bì chả", amountVnd: 45000, sortOrder: 1 },
    { slug: "com-bi", name: "Cơm tấm bì chả", amountVnd: 40000, sortOrder: 2 },
    { slug: "com-cha", name: "Cơm tấm chả trứng", amountVnd: 42000, sortOrder: 3 },
  ],
  "pho-ba-hang": [
    { slug: "pho-tai", name: "Phở bò tái", description: "Tái lăn, nước dùng ninh xương", amountVnd: 50000, sortOrder: 1 },
    { slug: "pho-nam", name: "Phở bò nạm", amountVnd: 55000, sortOrder: 2 },
    { slug: "pho-dac-biet", name: "Phở đặc biệt", amountVnd: 65000, sortOrder: 3 },
  ],
  "bun-cha-ha-noi-kvl": [
    { slug: "bun-cha", name: "Bún chả Hà Nội", amountVnd: 45000, sortOrder: 1 },
    { slug: "nem-ran", name: "Nem rán (4 cuốn)", amountVnd: 30000, sortOrder: 2 },
  ],
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
    for (const [providerSlug, items] of Object.entries(MENUS)) {
      const providers = await sql<{ id: string; location_id: string }[]>`
        SELECT p.id, pl.id AS location_id
        FROM providers p
        INNER JOIN provider_locations pl ON pl.provider_id = p.id
        WHERE p.slug = ${providerSlug}
        LIMIT 1
      `;
      const row = providers[0];
      if (!row) {
        console.warn("Provider not found, skip menu:", providerSlug);
        continue;
      }

      for (const item of items) {
        const existing = await sql<{ id: string }[]>`
          SELECT id FROM offerings
          WHERE provider_id = ${row.id}::uuid AND slug = ${item.slug}
          LIMIT 1
        `;
        if (existing[0]) continue;

        await sql.begin(async (tx) => {
          const [offering] = await tx<{ id: string }[]>`
            INSERT INTO offerings (
              provider_id, slug, name, description, sort_order, status
            ) VALUES (
              ${row.id}::uuid,
              ${item.slug},
              ${item.name},
              ${item.description ?? null},
              ${item.sortOrder},
              ${"ACTIVE"}
            )
            RETURNING id
          `;
          if (!offering) throw new Error(`Failed offering ${item.slug}`);

          await tx`
            INSERT INTO offering_prices (
              offering_id, provider_location_id, amount_vnd, pricing_kind
            ) VALUES (
              ${offering.id}::uuid,
              ${row.location_id}::uuid,
              ${item.amountVnd},
              ${"FIXED"}
            )
          `;
        });
        console.log("Seeded menu item:", providerSlug, item.name);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
