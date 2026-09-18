import type postgres from "postgres";

export type ZoneBoundaryGeoJson = {
  type: "MultiPolygon" | "Polygon";
  coordinates: number[][][] | number[][][][];
};

/** Current published Zone boundary as GeoJSON (WGS84). */
export async function getZoneBoundaryGeoJson(
  sql: postgres.Sql,
  zoneId: string,
): Promise<ZoneBoundaryGeoJson | null> {
  const rows = await sql<{ geojson: string | null }[]>`
    SELECT ST_AsGeoJSON(vb.boundary)::text AS geojson
    FROM zone_boundary_versions vb
    WHERE vb.zone_id = ${zoneId}::uuid
      AND vb.valid_to IS NULL
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

/** Lat/lng from address PostGIS point, if set. */
export async function getAddressLatLng(
  sql: postgres.Sql,
  addressId: string,
): Promise<{ lat: number; lng: number } | null> {
  const rows = await sql<{ lat: number; lng: number }[]>`
    SELECT
      ST_Y(coordinates)::float8 AS lat,
      ST_X(coordinates)::float8 AS lng
    FROM addresses
    WHERE id = ${addressId}::uuid
      AND coordinates IS NOT NULL
    LIMIT 1
  `;
  const row = rows[0];
  if (!row || Number.isNaN(row.lat) || Number.isNaN(row.lng)) return null;
  return { lat: row.lat, lng: row.lng };
}
