import type { PickiSql } from "../client.js";
import { searchZoneUniversal } from "../search/universal.js";
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
  logo_url?: string | null;
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
  lat: number | null;
  lng: number | null;
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
          AND (o.food_moment = ANY(${foodMoments}) OR o.food_moment IS NULL)
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering,
      pp.logo_url
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM family_dinner_provider_settings fds
        WHERE fds.provider_location_id = pl.id AND fds.enabled = true
      )
      AND (
        EXISTS (
          SELECT 1 FROM offerings o
          WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
            AND o.food_moment = ANY(${foodMoments})
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

export type LateNightDiscoveryRow = DiscoveryProviderRow & {
  late_starts_at: string;
  late_ends_at: string;
};

/** Bếp «Bữa tối ấm cúng» đang bật trong Zone. */
export async function listFamilyDinnerProvidersEnabled(
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
        SELECT fi.name FROM family_dinner_menu_items fi
        INNER JOIN family_dinner_daily_menus fdm ON fdm.id = fi.daily_menu_id
        WHERE fdm.provider_location_id = pl.id
          AND fdm.service_date = (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
          AND fdm.status = 'PUBLISHED'
        ORDER BY fi.sort_order
        LIMIT 1
      ) AS sample_offering,
      pp.logo_url
    FROM family_dinner_provider_settings fds
    INNER JOIN provider_locations pl ON pl.id = fds.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm
      ON pzm.provider_location_id = pl.id
      AND pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE fds.enabled = true
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY p.brand_name
  `;
}

/** Quán đang bật «Sáng mai» + menu PUBLISHED (accepting filter in service). */
export async function listBreakfastPreorderProvidersEnabled(
  sql: PickiSql,
  zoneId: string,
  serviceDate: string,
): Promise<(DiscoveryProviderRow & { cutoff_time: string; open_from_time: string })[]> {
  return sql<(DiscoveryProviderRow & { cutoff_time: string; open_from_time: string })[]>`
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering,
      pp.logo_url,
      to_char(bps.cutoff_time, 'HH24:MI') AS cutoff_time,
      to_char(bps.open_from_time, 'HH24:MI') AS open_from_time
    FROM breakfast_preorder_provider_settings bps
    INNER JOIN provider_locations pl ON pl.id = bps.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm
      ON pzm.provider_location_id = pl.id
      AND pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
    INNER JOIN breakfast_preorder_daily_menus bdm
      ON bdm.provider_location_id = pl.id
      AND bdm.service_date = ${serviceDate}::date
      AND bdm.daypart = 'BREAKFAST'
      AND bdm.status = 'PUBLISHED'
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE bps.enabled = true
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY p.brand_name
  `;
}

/** Providers with Bán khuya enabled (window filter applied in service). */
export async function listLateNightProvidersEnabled(
  sql: PickiSql,
  zoneId: string,
): Promise<LateNightDiscoveryRow[]> {
  return sql<LateNightDiscoveryRow[]>`
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering,
      to_char(lns.starts_at, 'HH24:MI') AS late_starts_at,
      to_char(lns.ends_at, 'HH24:MI') AS late_ends_at,
      pp.logo_url
    FROM late_night_provider_settings lns
    INNER JOIN provider_locations pl ON pl.id = lns.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm
      ON pzm.provider_location_id = pl.id
      AND pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE lns.enabled = true
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND COALESCE(pls.status, 'OFFLINE') IN ('OPEN', 'BUSY')
    ORDER BY
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        ELSE 2
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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

/** XE ĐƯA ĐÓN — sân bay / về quê / du lịch / học sinh (ADR-049). */
export async function listTransportProviders(
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
      AND p.provider_type = 'TRANSPORT_PROVIDER'
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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

export type MarketGoodsCategoryRow = {
  id: string;
  name: string;
  type: string;
};

/** Đi chợ shelf. Local sellers sort first. Supermarket stays in the result when category data matches. */
export async function listMarketShelf(
  sql: PickiSql,
  zoneId: string,
  goodsCategoryId?: string | null,
): Promise<DiscoveryProviderRow[]> {
  const categoryId = goodsCategoryId ?? null;
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
      AND p.provider_type IN ('MINIMART', 'MARKET_VENDOR', 'RETAIL_STORE', 'SUPERMARKET')
      AND (
        ${categoryId}::uuid IS NULL
        OR p.primary_category_id = ${categoryId}::uuid
        OR EXISTS (
          SELECT 1 FROM offerings o
          WHERE o.provider_id = p.id
            AND o.status = 'ACTIVE'
            AND o.category_id = ${categoryId}::uuid
        )
      )
    ORDER BY
      CASE WHEN p.provider_type = 'SUPERMARKET' THEN 1 ELSE 0 END,
      CASE COALESCE(pls.status, 'OFFLINE')
        WHEN 'OPEN' THEN 0
        WHEN 'BUSY' THEN 1
        WHEN 'CLOSED' THEN 2
        ELSE 3
      END,
      p.brand_name
  `;
}

export async function listMarketGoodsCategories(sql: PickiSql): Promise<MarketGoodsCategoryRow[]> {
  return sql<MarketGoodsCategoryRow[]>`
    SELECT id, name, type
    FROM product_categories
    WHERE active = true
      AND parent_id IS NULL
      AND type IN ('FRESH', 'RETAIL')
    ORDER BY CASE type WHEN 'FRESH' THEN 0 ELSE 1 END, sort_order, name
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering,
      pp.logo_url
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

export type ExploreChip = "new" | "open" | "near" | "popular" | "bia-hoi";

/** Shops Ops enabled for draft beer, with an active sealed-pour offering. */
export async function listDraftBeerProviders(
  sql: PickiSql,
  zoneId: string,
  opts?: { limit?: number },
): Promise<DiscoveryProviderRow[]> {
  const limit = opts?.limit ?? 8;
  return sql<DiscoveryProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      COALESCE(
        (
          SELECT 'Bia hơi từ ' || COALESCE(op.amount_vnd, opm.amount_vnd)::text || 'đ'
          FROM offerings beer
          LEFT JOIN offering_prices op ON op.offering_id = beer.id AND op.provider_location_id = pl.id
          LEFT JOIN offering_prices opm ON opm.offering_id = beer.id AND opm.provider_location_id IS NULL
          WHERE beer.provider_id = p.id
            AND beer.alcohol_restricted = true
            AND beer.status = 'ACTIVE'
          LIMIT 1
        ),
        pp.tagline
      ) AS tagline,
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order LIMIT 1
      ) AS sample_offering,
      pp.logo_url
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_capabilities pc
      ON pc.provider_id = p.id AND pc.capability = 'DRAFT_BEER_SALES' AND pc.enabled = true
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND COALESCE(pls.status, 'OFFLINE') IN ('OPEN', 'BUSY')
      AND EXISTS (
        SELECT 1 FROM offerings beer
        LEFT JOIN product_daily_availability day
          ON day.offering_id = beer.id
          AND day.provider_location_id = pl.id
          AND day.service_date = (timezone('Asia/Ho_Chi_Minh', now()))::date
        WHERE beer.provider_id = p.id
          AND beer.alcohol_restricted = true
          AND beer.status = 'ACTIVE'
          AND (day.status IS NULL OR day.status NOT IN ('HIDDEN', 'SOLD_OUT'))
      )
    ORDER BY p.brand_name
    LIMIT ${limit}
  `;
}

/**
 * Home «Khám phá» chips — zone-scoped, no meter distance.
 * near ≈ đang hoạt động trong Zone (OPEN/BUSY first).
 */
export async function listExploreProviders(
  sql: PickiSql,
  zoneId: string,
  chip: ExploreChip,
  opts?: { excludeLocationIds?: string[]; limit?: number; providerTypes?: readonly string[] },
): Promise<DiscoveryProviderRow[]> {
  const limit = opts?.limit ?? 8;
  const exclude = opts?.excludeLocationIds ?? [];
  const providerTypes = opts?.providerTypes ?? [];

  if (chip === "open" || chip === "near") {
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
          WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
          ORDER BY o.sort_order LIMIT 1
        ) AS sample_offering,
        pp.logo_url
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE'
        AND pl.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND (cardinality(${providerTypes}::text[]) = 0 OR p.provider_type = ANY(${providerTypes}::text[]))
        AND COALESCE(pls.status, 'OFFLINE') IN ('OPEN', 'BUSY')
        AND (cardinality(${exclude}::uuid[]) = 0 OR NOT (pl.id = ANY(${exclude}::uuid[])))
      ORDER BY
        CASE COALESCE(pls.status, 'OFFLINE') WHEN 'OPEN' THEN 0 ELSE 1 END,
        pls.updated_at DESC NULLS LAST,
        p.brand_name
      LIMIT ${limit}
    `;
  }

  if (chip === "new") {
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
          WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
          ORDER BY o.sort_order LIMIT 1
        ) AS sample_offering,
        pp.logo_url
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE'
        AND pl.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND (cardinality(${providerTypes}::text[]) = 0 OR p.provider_type = ANY(${providerTypes}::text[]))
        AND (cardinality(${exclude}::uuid[]) = 0 OR NOT (pl.id = ANY(${exclude}::uuid[])))
        AND (
          (pl.opens_at IS NOT NULL AND pl.opens_at > now())
          OR (pl.opens_at IS NOT NULL AND pl.opens_at <= now() AND pl.opens_at > now() - interval '14 days')
          OR (pl.opens_at IS NULL AND pl.created_at > now() - interval '14 days')
        )
      ORDER BY
        CASE WHEN pl.opens_at IS NOT NULL AND pl.opens_at > now() THEN 0 ELSE 1 END,
        pl.opens_at DESC NULLS LAST,
        pl.created_at DESC
      LIMIT ${limit}
    `;
  }

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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order LIMIT 1
      ) AS sample_offering,
      pp.logo_url
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND (cardinality(${providerTypes}::text[]) = 0 OR p.provider_type = ANY(${providerTypes}::text[]))
      AND (cardinality(${exclude}::uuid[]) = 0 OR NOT (pl.id = ANY(${exclude}::uuid[])))
    ORDER BY
      (
        SELECT COUNT(*) FROM orders o
        WHERE o.provider_location_id = pl.id
          AND o.status IN ('DELIVERED', 'COMPLETED')
      ) DESC,
      (
        SELECT COUNT(*) FROM location_reviews lr
        WHERE lr.provider_location_id = pl.id
      ) DESC,
      p.brand_name
    LIMIT ${limit}
  `;
}

/** Browse by provider_type list (home categories). */
export async function listProvidersByTypes(
  sql: PickiSql,
  zoneId: string,
  providerTypes: string[],
): Promise<DiscoveryProviderRow[]> {
  if (providerTypes.length === 0) return [];
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
        WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
        ORDER BY o.sort_order
        LIMIT 1
      ) AS sample_offering,
      pp.logo_url
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND p.provider_type = ANY(${providerTypes})
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

export async function searchZone(
  sql: PickiSql,
  zoneId: string,
  query: string,
): Promise<SearchResultRow[]> {
  const groups = await searchZoneUniversal(sql, { zoneId, query });
  const flat: SearchResultRow[] = [];
  for (const g of groups) {
    for (const r of g.results) {
      if (r.kind === "category" || !r.location_id || !r.provider_id) continue;
      flat.push({
        kind: r.kind === "provider" ? "provider" : "offering",
        location_id: r.location_id,
        provider_id: r.provider_id,
        brand_name: r.brand_name ?? "",
        display_name: r.display_name ?? "",
        live_status: r.live_status ?? "OFFLINE",
        offering_id: r.item_id,
        offering_name: r.item_name,
        amount_vnd: r.amount_vnd,
        lat: r.lat,
        lng: r.lng,
      });
    }
  }
  return flat.slice(0, 30);
}

export type MapProviderFilters = {
  /** Exclude CLOSED / NOT_ACCEPTING / OFFLINE */
  openOnly?: boolean;
  providerTypes?: string[];
};

const OPEN_LIVE = ["AVAILABLE_NOW", "SHORT_WAIT", "BUSY", "OPEN"] as const;

export async function listMapProviders(
  sql: PickiSql,
  zoneId: string,
  filters: MapProviderFilters = {},
): Promise<DiscoveryProviderRow[]> {
  const types = (filters.providerTypes ?? []).filter(Boolean);
  const openOnly = filters.openOnly === true;

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
      ${types.length > 0 ? sql`AND p.provider_type = ANY(${types})` : sql``}
      ${
        openOnly
          ? sql`AND COALESCE(pls.status, 'OFFLINE') = ANY(${[...OPEN_LIVE]})`
          : sql``
      }
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
