import type postgres from "postgres";
import { validateLatLng, type LatLng } from "./types.js";

export type DiscoveredZoneRow = {
  zone_id: string;
  slug: string;
  name: string;
  display_name: string;
  status: string;
  anchor_lng: number;
  anchor_lat: number;
};

/** Find ACTIVE/PILOT zones whose current boundary contains the point. */
export async function discoverZonesAtPoint(
  sql: postgres.Sql,
  point: LatLng,
): Promise<DiscoveredZoneRow[]> {
  validateLatLng(point);

  return sql<DiscoveredZoneRow[]>`
    SELECT
      z.id AS zone_id,
      z.slug,
      z.name,
      z.display_name,
      z.status,
      z.anchor_lng,
      z.anchor_lat
    FROM zones z
    INNER JOIN zone_boundary_versions vb ON vb.zone_id = z.id AND vb.valid_to IS NULL
    WHERE z.status IN ('PILOT', 'ACTIVE')
      AND ST_Contains(
        vb.boundary,
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
      )
    ORDER BY z.name
  `;
}

export async function countZoneMembers(sql: postgres.Sql, zoneId: string): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(*)::text AS count
    FROM user_zone_memberships
    WHERE zone_id = ${zoneId}::uuid
      AND status IN ('JOINED', 'VERIFIED')
  `;
  return Number(rows[0]?.count ?? 0);
}
