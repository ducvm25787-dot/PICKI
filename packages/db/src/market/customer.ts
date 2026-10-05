import type postgres from "postgres";

export type FreshStallRow = {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  stall_code: string | null;
  seller_portrait_url: string | null;
  logo_url: string | null;
  tagline: string | null;
  primary_category_id: string | null;
  cluster_id: string | null;
  cluster_name: string | null;
  cluster_slug: string | null;
  live_status: string;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  avg_rating: string | null;
  review_count: string;
  distance_meters: number | null;
  open_all_day: boolean;
};

const stallSelect = `
  pl.id AS location_id,
  p.id AS provider_id,
  p.brand_name,
  pl.display_name,
  p.provider_type,
  pl.stall_code,
  pl.seller_portrait_url,
  pp.logo_url,
  pp.tagline,
  p.primary_category_id,
  mc.id AS cluster_id,
  mc.name AS cluster_name,
  mc.slug AS cluster_slug,
  COALESCE(pls.status, 'OFFLINE') AS live_status,
  pl.address_line,
  pl.lat,
  pl.lng,
  (
    SELECT ROUND(AVG(lr.rating)::numeric, 1)::text
    FROM location_reviews lr
    WHERE lr.provider_location_id = pl.id
  ) AS avg_rating,
  (
    SELECT COUNT(*)::text FROM location_reviews lr
    WHERE lr.provider_location_id = pl.id
  ) AS review_count
`;

export async function listActiveMarketClusters(
  sql: postgres.Sql,
  zoneId: string,
): Promise<
  {
    id: string;
    name: string;
    slug: string;
    stall_count: string;
    category_ids: string[] | null;
  }[]
> {
  return sql`
    SELECT
      mc.id,
      mc.name,
      mc.slug,
      COUNT(pl.id)::text AS stall_count,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT p.primary_category_id), NULL) AS category_ids
    FROM market_clusters mc
    LEFT JOIN provider_locations pl
      ON pl.market_cluster_id = mc.id
     AND pl.status = 'ACTIVE'
    LEFT JOIN providers p
      ON p.id = pl.provider_id
     AND p.status = 'ACTIVE'
     AND p.provider_type IN ('MARKET_VENDOR', 'SPECIALTY_STORE')
    WHERE mc.zone_id = ${zoneId}::uuid
      AND mc.status = 'ACTIVE'
    GROUP BY mc.id
    ORDER BY mc.name
  `;
}

export async function listClusterStalls(
  sql: postgres.Sql,
  zoneId: string,
  clusterSlug: string,
): Promise<FreshStallRow[]> {
  return sql<FreshStallRow[]>`
    SELECT
      ${sql.unsafe(stallSelect)},
      NULL::int AS distance_meters,
      false AS open_all_day
    FROM market_clusters mc
    INNER JOIN provider_locations pl ON pl.market_cluster_id = mc.id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE mc.zone_id = ${zoneId}::uuid
      AND mc.slug = ${clusterSlug}
      AND mc.status = 'ACTIVE'
      AND pzm.zone_id = mc.zone_id
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type IN ('MARKET_VENDOR', 'SPECIALTY_STORE')
    ORDER BY pl.display_name
  `;
}

export async function listSpecialtyStores(sql: postgres.Sql, zoneId: string): Promise<FreshStallRow[]> {
  return sql<FreshStallRow[]>`
    SELECT
      ${sql.unsafe(stallSelect)},
      NULL::int AS distance_meters,
      false AS open_all_day
    FROM provider_locations pl
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    LEFT JOIN market_clusters mc ON mc.id = pl.market_cluster_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'SPECIALTY_STORE'
    ORDER BY pl.display_name
  `;
}

export async function listConvenienceStores(sql: postgres.Sql, zoneId: string): Promise<FreshStallRow[]> {
  return sql<FreshStallRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      NULL::text AS stall_code,
      NULL::text AS seller_portrait_url,
      pp.logo_url,
      pp.tagline,
      p.primary_category_id,
      NULL::uuid AS cluster_id,
      NULL::text AS cluster_name,
      NULL::text AS cluster_slug,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pl.address_line,
      pl.lat,
      pl.lng,
      (
        SELECT ROUND(AVG(lr.rating)::numeric, 1)::text
        FROM location_reviews lr
        WHERE lr.provider_location_id = pl.id
      ) AS avg_rating,
      (
        SELECT COUNT(*)::text FROM location_reviews lr
        WHERE lr.provider_location_id = pl.id
      ) AS review_count,
      CASE
        WHEN pl.lat IS NULL OR pl.lng IS NULL THEN NULL
        ELSE ROUND((
          6371000 * acos(LEAST(1, GREATEST(-1,
            cos(radians(z.anchor_lat)) * cos(radians(pl.lat))
              * cos(radians(pl.lng) - radians(z.anchor_lng))
            + sin(radians(z.anchor_lat)) * sin(radians(pl.lat))
          )))
        ))::int
      END AS distance_meters,
      (
        COALESCE(pp.tagline, '') ILIKE '%24/7%'
        OR COALESCE(pp.tagline, '') ILIKE '%24 giờ%'
      ) AS open_all_day
    FROM provider_locations pl
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    INNER JOIN zones z ON z.id = pzm.zone_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type IN ('MINIMART', 'CONVENIENCE_STORE')
    ORDER BY p.provider_type, p.brand_name
  `;
}
