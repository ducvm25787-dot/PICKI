import type { PickiSql } from "../client.js";

export type ZoneProviderRow = {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  tagline: string | null;
  live_status: string;
  address_line: string | null;
  prep_minutes: number | null;
  eta_minutes: number | null;
  lat: number | null;
  lng: number | null;
};

export async function countActiveProvidersInZone(
  sql: PickiSql,
  zoneId: string,
): Promise<number> {
  const rows = await sql<{ count: string }[]>`
    SELECT COUNT(DISTINCT pl.id)::text AS count
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function listActiveProvidersInZone(
  sql: PickiSql,
  zoneId: string,
): Promise<ZoneProviderRow[]> {
  return sql<ZoneProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pl.address_line,
      pls.prep_minutes,
      pls.eta_minutes,
      pl.lat,
      pl.lng
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      p.brand_name
  `;
}
