import type postgres from "postgres";
import type { ZoneBoundaryGeoJson } from "./boundary.js";

export type AdminRingPoint = { lat: number; lng: number };

/** Outer ring of first polygon as lat/lng (closed ring optional). */
export function geoJsonToOuterRing(geo: ZoneBoundaryGeoJson | null): AdminRingPoint[] {
  if (!geo) return [];
  const coords =
    geo.type === "Polygon"
      ? (geo.coordinates as number[][][])[0]
      : (geo.coordinates as number[][][][])[0]?.[0];
  if (!coords?.length) return [];
  return coords.map(([lng, lat]) => ({ lat: lat!, lng: lng! }));
}

export function ringToMultiPolygonGeoJson(ring: AdminRingPoint[]): ZoneBoundaryGeoJson {
  if (ring.length < 3) {
    throw new Error("Polygon needs at least 3 vertices");
  }
  const coords: number[][] = ring.map((p) => [p.lng, p.lat]);
  const first = coords[0]!;
  const last = coords[coords.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0]!, first[1]!]);
  }
  return {
    type: "MultiPolygon",
    coordinates: [[coords]],
  };
}

export async function getServiceAreaGeoJson(
  sql: postgres.Sql,
  zoneId: string,
  kind: string,
): Promise<ZoneBoundaryGeoJson | null> {
  const rows = await sql<{ geojson: string | null }[]>`
    SELECT ST_AsGeoJSON(sa.boundary)::text AS geojson
    FROM service_areas sa
    WHERE sa.zone_id = ${zoneId}::uuid
      AND sa.kind = ${kind}
    LIMIT 1
  `;
  const raw = rows[0]?.geojson;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ZoneBoundaryGeoJson;
  } catch {
    return null;
  }
}

export async function publishZoneBoundary(
  sql: postgres.Sql,
  opts: {
    zoneId: string;
    geojson: ZoneBoundaryGeoJson;
    changeReason: string;
    createdBy: string;
  },
): Promise<{ version: number; boundaryId: string }> {
  const geoText = JSON.stringify(opts.geojson);
  return sql.begin(async (tx) => {
    await tx`
      UPDATE zone_boundary_versions
      SET valid_to = now()
      WHERE zone_id = ${opts.zoneId}::uuid
        AND valid_to IS NULL
    `;
    const prev = await tx<{ version: number }[]>`
      SELECT COALESCE(MAX(version), 0)::int AS version
      FROM zone_boundary_versions
      WHERE zone_id = ${opts.zoneId}::uuid
    `;
    const nextVersion = Number(prev[0]?.version ?? 0) + 1;
    const inserted = await tx<{ id: string }[]>`
      INSERT INTO zone_boundary_versions (
        zone_id, version, boundary, change_reason, created_by, valid_from
      ) VALUES (
        ${opts.zoneId}::uuid,
        ${nextVersion},
        ST_SetSRID(ST_GeomFromGeoJSON(${geoText}), 4326),
        ${opts.changeReason},
        ${opts.createdBy}::uuid,
        now()
      )
      RETURNING id
    `;
    const boundaryId = inserted[0]?.id;
    if (!boundaryId) throw new Error("Failed to insert boundary version");
    return { version: nextVersion, boundaryId };
  });
}

export async function upsertServiceArea(
  sql: postgres.Sql,
  opts: {
    zoneId: string;
    kind: string;
    geojson: ZoneBoundaryGeoJson;
  },
): Promise<{ id: string; kind: string }> {
  const geoText = JSON.stringify(opts.geojson);
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM service_areas
    WHERE zone_id = ${opts.zoneId}::uuid AND kind = ${opts.kind}
    LIMIT 1
  `;
  if (existing[0]) {
    await sql`
      UPDATE service_areas
      SET boundary = ST_SetSRID(ST_GeomFromGeoJSON(${geoText}), 4326)
      WHERE id = ${existing[0].id}::uuid
    `;
    return { id: existing[0].id, kind: opts.kind };
  }
  const inserted = await sql<{ id: string }[]>`
    INSERT INTO service_areas (zone_id, kind, boundary)
    VALUES (
      ${opts.zoneId}::uuid,
      ${opts.kind},
      ST_SetSRID(ST_GeomFromGeoJSON(${geoText}), 4326)
    )
    RETURNING id
  `;
  const id = inserted[0]?.id;
  if (!id) throw new Error("Failed to insert service area");
  return { id, kind: opts.kind };
}
