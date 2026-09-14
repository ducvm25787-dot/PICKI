import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const PICKI_POINTS = [
  { building: "CT12A", name: "Sảnh CT12A · Picki Point", pointType: "LOBBY", lat: 20.9885, lng: 105.8416 },
  { building: "CT11", name: "Sảnh CT11 · Lobby", pointType: "LOBBY", lat: 20.9890, lng: 105.8410 },
  { building: "CT12A", name: "Bàn Picki CT12A", pointType: "DESK", lat: 20.9886, lng: 105.8417 },
] as const;

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
      console.error("KVL zone missing");
      process.exit(1);
    }

    await sql`
      INSERT INTO zone_fulfillment_settings (
        zone_id, batch_wait_window_minutes, max_batch_orders, max_route_detour_meters
      ) VALUES (${zone[0].id}::uuid, 5, 3, 500)
      ON CONFLICT (zone_id) DO UPDATE SET
        batch_wait_window_minutes = EXCLUDED.batch_wait_window_minutes,
        max_batch_orders = EXCLUDED.max_batch_orders,
        updated_at = now()
    `;

    for (const point of PICKI_POINTS) {
      const exists = await sql<{ id: string }[]>`
        SELECT id FROM picki_points
        WHERE zone_id = ${zone[0].id}::uuid
          AND building = ${point.building}
          AND point_type = ${point.pointType}
        LIMIT 1
      `;
      if (exists[0]) continue;

      await sql`
        INSERT INTO picki_points (zone_id, building, name, point_type, lat, lng, status)
        VALUES (
          ${zone[0].id}::uuid,
          ${point.building},
          ${point.name},
          ${point.pointType},
          ${point.lat},
          ${point.lng},
          'ACTIVE'
        )
      `;
    }

    console.log("Seeded S23: zone batching settings + Picki Points (CT12A, CT11)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
