import type { PickiSql } from "../client.js";
import type { FoodMoment } from "./blocks.js";

export type DiscoveryProviderRow = {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  tagline: string | null;
  live_status: string;
  prep_minutes: number | null;
  eta_minutes: number | null;
  estimated_wait_minutes: number | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  avg_rating: string | null;
  review_count: string;
  sample_offering: string | null;
};

export type SearchResultRow = {
  kind: "provider" | "offering";
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  live_status: string;
  offering_id: string | null;
  offering_name: string | null;
  amount_vnd: number | null;
};

export type DailySpecialRow = {
  special_id: string;
  offering_id: string;
  name: string;
  description: string | null;
  amount_vnd: number;
  quantity_remaining: number;
  food_moment: string | null;
  fulfillment_mode: string | null;
};

export async function listDiscoveryProviders(
  sql: PickiSql,
  zoneId: string,
  foodMoments: FoodMoment[],
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
          AND (o.food_moment = ANY(${foodMoments}) OR o.food_moment IS NULL)
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND (
        EXISTS (
          SELECT 1 FROM offerings o
          WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
            AND o.food_moment = ANY(${foodMoments})
        )
        OR NOT EXISTS (
          SELECT 1 FROM offerings o2
          WHERE o2.provider_id = p.id AND o2.food_moment IS NOT NULL
        )
      )
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

export async function listHomeServiceProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'HOME_SERVICE'
    ORDER BY p.brand_name
  `;
}

export async function listBeautyProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'BEAUTY'
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      COALESCE(pls.estimated_wait_minutes, 999),
      p.brand_name
  `;
}

export async function listPetProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'PET_SERVICE'
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      COALESCE(pls.estimated_wait_minutes, 999),
      p.brand_name
  `;
}

export async function listSportsProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'SPORTS_FACILITY'
    ORDER BY p.brand_name
  `;
}

export async function listAutoProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'AUTO_SERVICE'
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      COALESCE(pls.estimated_wait_minutes, 999),
      p.brand_name
  `;
}

/**
 * Phòng khám — chỉ hiện khi giấy phép hoạt động đã được verify (§86).
 */
export async function listHealthProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'HEALTH_PROVIDER'
      AND pp.license_verified_at IS NOT NULL
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      COALESCE(pls.estimated_wait_minutes, 999),
      p.brand_name
  `;
}

/**
 * Nhà thuốc — LISTING + LIVE + CONTACT; giấy phép verified (§86 / ADR-043).
 * Không giỏ thuốc. Ưu tiên đang mở (hữu ích đêm muộn trong Zone).
 */
export async function listPharmacyProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'PHARMACY'
      AND pp.license_verified_at IS NOT NULL
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

/** ĐI CHỢ — minimart / tạp hóa / sạp / retail nhỏ (không license gate). */
export async function listMarketProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type IN ('MINIMART', 'MARKET_VENDOR', 'RETAIL_STORE')
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

export async function listEducationProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type IN ('EDUCATION_PROVIDER', 'TUTOR')
    ORDER BY p.brand_name
  `;
}

export async function listLaundryProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      (
        SELECT o.name FROM offerings o
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = 'LAUNDRY'
    ORDER BY p.brand_name
  `;
}

export async function searchZone(
  sql: PickiSql,
  zoneId: string,
  query: string,
): Promise<SearchResultRow[]> {
  const q = `%${query.trim()}%`;
  return sql<SearchResultRow[]>`
    SELECT * FROM (
      SELECT
        'provider'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        NULL::uuid AS offering_id,
        NULL::text AS offering_name,
        NULL::integer AS amount_vnd
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND (p.brand_name ILIKE ${q} OR pl.display_name ILIKE ${q} OR pp.tagline ILIKE ${q})
      UNION ALL
      SELECT
        'offering'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        o.id AS offering_id,
        o.name AS offering_name,
        COALESCE(op.amount_vnd, opm.amount_vnd) AS amount_vnd
      FROM offerings o
      INNER JOIN providers p ON p.id = o.provider_id
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      LEFT JOIN offering_prices op ON op.offering_id = o.id AND op.provider_location_id = pl.id
      LEFT JOIN offering_prices opm ON opm.offering_id = o.id AND opm.provider_location_id IS NULL
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND o.status = 'ACTIVE'
        AND (o.name ILIKE ${q} OR o.description ILIKE ${q})
    ) results
    LIMIT 30
  `;
}

export async function listMapProviders(
  sql: PickiSql,
  zoneId: string,
): Promise<DiscoveryProviderRow[]> {
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      pp.tagline,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
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
      NULL::text AS sample_offering
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND pl.lat IS NOT NULL AND pl.lng IS NOT NULL
    ORDER BY p.brand_name
  `;
}

export async function listDailySpecialsForLocation(
  sql: PickiSql,
  locationId: string,
): Promise<DailySpecialRow[]> {
  return sql<DailySpecialRow[]>`
    SELECT
      ds.id AS special_id,
      o.id AS offering_id,
      o.name,
      o.description,
      COALESCE(op.amount_vnd, opm.amount_vnd) AS amount_vnd,
      ds.quantity_remaining,
      o.food_moment,
      o.fulfillment_mode
    FROM daily_specials ds
    INNER JOIN offerings o ON o.id = ds.offering_id
    INNER JOIN provider_locations pl ON pl.id = ds.provider_location_id
    LEFT JOIN offering_prices op ON op.offering_id = o.id AND op.provider_location_id = pl.id
    LEFT JOIN offering_prices opm ON opm.offering_id = o.id AND opm.provider_location_id IS NULL
    WHERE ds.provider_location_id = ${locationId}::uuid
      AND ds.available_date = CURRENT_DATE
      AND ds.quantity_remaining > 0
      AND o.status = 'ACTIVE'
    ORDER BY ds.quantity_remaining ASC, o.name
  `;
}
