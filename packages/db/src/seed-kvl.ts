import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
const ANCHOR = { lat: 20.9883, lng: 105.8414 };

/** Pilot boundary — operator-adjusted polygon around Kim Văn – Kim Lũ demand core. */
const KVL_BOUNDARY_WKT =
  "MULTIPOLYGON(((105.830 20.980, 105.855 20.980, 105.855 21.000, 105.830 21.000, 105.830 20.980)))";

const CORE_WKT =
  "MULTIPOLYGON(((105.838 20.985, 105.848 20.985, 105.848 20.992, 105.838 20.992, 105.838 20.985)))";

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  try {
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM zones WHERE slug = ${KVL_SLUG} LIMIT 1
    `;
    if (existing[0]) {
      console.log("Kim Văn – Kim Lũ zone already seeded:", existing[0].id);
      return;
    }

    await sql.begin(async (tx) => {
      const [candidate] = await tx<{ id: string }[]>`
        INSERT INTO zone_candidates (
          slug, name, display_name, status,
          anchor_lng, anchor_lat, proposed_boundary, scores, notes
        ) VALUES (
          ${KVL_SLUG},
          ${"Kim Văn – Kim Lũ"},
          ${"PICKI · KIM VĂN KIM LŨ"},
          ${"APPROVED"},
          ${ANCHOR.lng},
          ${ANCHOR.lat},
          ST_SetSRID(ST_GeomFromText(${KVL_BOUNDARY_WKT}), 4326),
          ${JSON.stringify({ total: 78, demand: 82, supply: 70, fulfillment: 75, expansion: 68 })}::jsonb,
          ${"Pilot Zone 1 — seeded for demo"}
        )
        RETURNING id
      `;

      if (!candidate) throw new Error("Failed to create candidate");

      const [zone] = await tx<{ id: string }[]>`
        INSERT INTO zones (
          slug, name, display_name, status, city_id,
          anchor_lng, anchor_lat, candidate_id
        ) VALUES (
          ${KVL_SLUG},
          ${"Kim Văn – Kim Lũ"},
          ${"PICKI · KIM VĂN KIM LŨ"},
          ${"ACTIVE"},
          (SELECT id FROM experience_cities WHERE code = 'Hanoi'),
          ${ANCHOR.lng},
          ${ANCHOR.lat},
          ${candidate.id}::uuid
        )
        RETURNING id
      `;

      if (!zone) throw new Error("Failed to create zone");

      await tx`
        INSERT INTO zone_boundary_versions (
          zone_id, version, boundary, change_reason
        ) VALUES (
          ${zone.id}::uuid,
          1,
          ST_SetSRID(ST_GeomFromText(${KVL_BOUNDARY_WKT}), 4326),
          ${"Initial pilot boundary — Kim Văn Kim Lũ"}
        )
      `;

      await tx`
        INSERT INTO zone_settings (zone_id, settings)
        VALUES (
          ${zone.id}::uuid,
          ${JSON.stringify({ pilot: true, city: "Hà Nội", district: "Hoàng Mai" })}::jsonb
        )
      `;

      await tx`
        INSERT INTO service_areas (zone_id, kind, boundary)
        VALUES (
          ${zone.id}::uuid,
          ${"CORE"},
          ST_SetSRID(ST_GeomFromText(${CORE_WKT}), 4326)
        )
      `;

      console.log("Seeded zone:", zone.id, KVL_SLUG);
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
