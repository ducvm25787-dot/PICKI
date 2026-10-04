import type postgres from "postgres";

export type DailyUpdateRow = {
  id: string;
  location_id: string;
  brand_name: string;
  display_name: string;
  update_type: string;
  title: string;
  description: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  cta_label: string | null;
  cta_href: string | null;
  expires_at: Date;
  live_status: string;
};

/** Active Today updates in Zone (not expired). */
export async function listTodayUpdatesInZone(
  sql: postgres.Sql,
  zoneId: string,
  limit = 12,
): Promise<DailyUpdateRow[]> {
  // Expire stale rows opportunistically
  await sql`
    UPDATE provider_daily_updates
    SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now()
  `;

  return sql<DailyUpdateRow[]>`
    SELECT
      u.id,
      pl.id AS location_id,
      p.brand_name,
      pl.display_name,
      u.update_type,
      u.title,
      u.description,
      u.image_url,
      COALESCE(u.image_urls, '[]'::jsonb) AS image_urls,
      u.cta_label,
      u.cta_href,
      u.expires_at,
      COALESCE(pls.status, 'OFFLINE') AS live_status
    FROM provider_daily_updates u
    INNER JOIN provider_locations pl ON pl.id = u.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    INNER JOIN provider_daily_update_zone_targets tgt
      ON tgt.update_id = u.id
     AND tgt.zone_id = pzm.zone_id
     AND tgt.review_status = 'APPROVED'
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND u.valid_from <= now()
      AND u.expires_at > now()
    ORDER BY u.created_at DESC
    LIMIT ${limit}
  `;
}

export type TodayFeaturedRow = {
  id: string;
  offering_id: string;
  location_id: string;
  brand_name: string;
  title: string;
  amount_vnd: number;
  list_amount_vnd: number;
  update_type: string;
  image_url: string | null;
  live_status: string;
};

/** One shop's featured dish for today, chosen from the catalog. Home spotlight. */
export async function listTodayFeaturedInZone(
  sql: postgres.Sql,
  zoneId: string,
  limit = 8,
): Promise<TodayFeaturedRow[]> {
  return sql<TodayFeaturedRow[]>`
    SELECT DISTINCT ON (pl.id)
      day.id,
      o.id AS offering_id,
      pl.id AS location_id,
      p.brand_name,
      o.name AS title,
      COALESCE(day.price_override_vnd, loc_price.amount_vnd, master_price.amount_vnd) AS amount_vnd,
      COALESCE(loc_price.amount_vnd, master_price.amount_vnd) AS list_amount_vnd,
      COALESCE(upd.update_type, 'DAILY_SPECIAL') AS update_type,
      o.image_url,
      COALESCE(pls.status, 'OFFLINE') AS live_status
    FROM product_daily_availability day
    INNER JOIN offerings o ON o.id = day.offering_id
    INNER JOIN provider_locations pl ON pl.id = day.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    LEFT JOIN offering_prices loc_price
      ON loc_price.offering_id = o.id AND loc_price.provider_location_id = pl.id
    LEFT JOIN offering_prices master_price
      ON master_price.offering_id = o.id AND master_price.provider_location_id IS NULL
    LEFT JOIN LATERAL (
      SELECT u.update_type
      FROM provider_daily_updates u
      INNER JOIN provider_daily_update_zone_targets t
        ON t.update_id = u.id
       AND t.zone_id = ${zoneId}::uuid
       AND t.review_status = 'APPROVED'
      WHERE u.provider_location_id = pl.id
        AND u.linked_entity_id = o.id
        AND u.expires_at > now()
      ORDER BY u.created_at DESC
      LIMIT 1
    ) upd ON true
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND o.status = 'ACTIVE'
      AND o.alcohol_restricted = false
      AND day.featured = true
      AND day.service_date = (timezone('Asia/Ho_Chi_Minh', now()))::date
      AND day.status IS DISTINCT FROM 'HIDDEN'
      AND day.status IS DISTINCT FROM 'SOLD_OUT'
      AND COALESCE(day.price_override_vnd, loc_price.amount_vnd, master_price.amount_vnd) > 0
    ORDER BY pl.id, day.updated_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export type HomeSurfaceRow = {
  id: string;
  offering_id: string;
  location_id: string;
  provider_id: string;
  brand_name: string;
  provider_type: string;
  title: string;
  amount_vnd: number;
  list_amount_vnd: number;
  image_url: string | null;
  live_status: string;
  category_name: string | null;
  created_at: Date;
};

/**
 * Approved merchandising only. featured is ignored.
 * Food surfaces require FOOD_SERVICE. MARKET_TODAY requires market commerce.
 */
export async function listApprovedHomeSurface(
  sql: postgres.Sql,
  zoneId: string,
  surface: "SPECIAL_TODAY" | "SNACK_DESSERT" | "MARKET_TODAY",
  limit = 24,
): Promise<HomeSurfaceRow[]> {
  const market = surface === "MARKET_TODAY";
  return sql<HomeSurfaceRow[]>`
    SELECT *
    FROM (
      SELECT DISTINCT ON (o.id)
        u.id,
        o.id AS offering_id,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        p.provider_type,
        o.name AS title,
        COALESCE(day.price_override_vnd, loc_price.amount_vnd, master_price.amount_vnd) AS amount_vnd,
        COALESCE(loc_price.amount_vnd, master_price.amount_vnd) AS list_amount_vnd,
        o.image_url,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        cat.name AS category_name,
        u.created_at
      FROM provider_daily_updates u
    INNER JOIN offerings o ON o.id = u.linked_entity_id
    INNER JOIN provider_locations pl ON pl.id = u.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
    INNER JOIN provider_daily_update_zone_targets tgt
      ON tgt.update_id = u.id
     AND tgt.zone_id = pzm.zone_id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    LEFT JOIN product_categories cat ON cat.id = o.category_id
    LEFT JOIN product_daily_availability day
      ON day.offering_id = o.id
      AND day.provider_location_id = pl.id
      AND day.service_date = (timezone('Asia/Ho_Chi_Minh', now()))::date
    LEFT JOIN offering_prices loc_price
      ON loc_price.offering_id = o.id AND loc_price.provider_location_id = pl.id
    LEFT JOIN offering_prices master_price
      ON master_price.offering_id = o.id AND master_price.provider_location_id IS NULL
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND o.status = 'ACTIVE'
      AND o.alcohol_restricted = false
      AND u.linked_entity_type = 'OFFERING'
      AND u.expires_at > now()
      AND tgt.review_status = 'APPROVED'
      AND tgt.approved_surface = ${surface}
      AND (
        (${market} AND p.commerce_model IN ('FRESH_MARKET', 'RETAIL_STORE'))
        OR (NOT ${market} AND p.commerce_model = 'FOOD_SERVICE')
      )
      AND (day.id IS NULL OR day.status IS DISTINCT FROM 'HIDDEN')
      AND (day.id IS NULL OR day.status IS DISTINCT FROM 'SOLD_OUT')
      AND COALESCE(day.price_override_vnd, loc_price.amount_vnd, master_price.amount_vnd) > 0
      ORDER BY o.id, u.created_at DESC
    ) picked
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function listLocationDailyUpdates(
  sql: postgres.Sql,
  locationId: string,
  includeExpired = false,
): Promise<
  {
    id: string;
    update_type: string;
    title: string;
    description: string | null;
    image_url: string | null;
    image_urls: string[] | null;
    expires_at: Date;
    status: string;
    created_at: Date;
  }[]
> {
  if (includeExpired) {
    return sql`
      SELECT
        id, update_type, title, description, image_url,
        COALESCE(image_urls, '[]'::jsonb) AS image_urls,
        expires_at, status, created_at
      FROM provider_daily_updates
      WHERE provider_location_id = ${locationId}::uuid
      ORDER BY created_at DESC
      LIMIT 30
    `;
  }
  return sql`
    SELECT
      id, update_type, title, description, image_url,
      COALESCE(image_urls, '[]'::jsonb) AS image_urls,
      expires_at, status, created_at
    FROM provider_daily_updates
    WHERE provider_location_id = ${locationId}::uuid
      AND status = 'ACTIVE'
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 20
  `;
}

export type NowAroundRow = {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  live_status: string;
  estimated_wait_minutes: number | null;
  live_message: string | null;
  tagline: string | null;
  sample_offering: string | null;
  update_id: string | null;
  update_title: string | null;
  update_description: string | null;
  source: "UPDATE" | "LIVE";
};

/**
 * Live / contextual shelf — auto from OPEN/BUSY + optional daily update overlay.
 * No distance meters.
 */
/** Phase 1 home rail: food and drink only. Other verticals stay in Tiện ích. */
export const HOME_FOOD_PROVIDER_TYPES = [
  "RESTAURANT",
  "FOOD_STALL",
  "HOME_COOK",
  "CAFE",
  "CAFÉ",
  "BAKERY",
  "FOOD",
] as const;

export async function listNowAroundInZone(
  sql: postgres.Sql,
  zoneId: string,
  limit = 5,
  providerTypes: readonly string[] = HOME_FOOD_PROVIDER_TYPES,
): Promise<NowAroundRow[]> {
  await sql`
    UPDATE provider_daily_updates
    SET status = 'EXPIRED', updated_at = now()
    WHERE status = 'ACTIVE' AND expires_at < now()
  `;

  return sql<NowAroundRow[]>`
    WITH live AS (
      SELECT
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        p.provider_type,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        pls.estimated_wait_minutes,
        pls.message AS live_message,
        pp.tagline,
        (
          SELECT o.name FROM offerings o
          WHERE o.provider_id = p.id AND o.status = 'ACTIVE' AND o.alcohol_restricted = false
          ORDER BY o.sort_order
          LIMIT 1
        ) AS sample_offering,
        u.id AS update_id,
        u.title AS update_title,
        u.description AS update_description,
        CASE WHEN u.id IS NOT NULL THEN 'UPDATE' ELSE 'LIVE' END AS source,
        CASE COALESCE(pls.status, 'OFFLINE')
          WHEN 'OPEN' THEN 0
          WHEN 'BUSY' THEN 1
          ELSE 2
        END AS status_rank,
        CASE WHEN u.id IS NOT NULL THEN 0 ELSE 1 END AS update_rank
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      LEFT JOIN LATERAL (
        SELECT u.id, u.title, u.description
        FROM provider_daily_updates u
        INNER JOIN provider_daily_update_zone_targets t
          ON t.update_id = u.id
         AND t.zone_id = pzm.zone_id
         AND t.review_status = 'APPROVED'
        WHERE u.provider_location_id = pl.id
          AND u.valid_from <= now()
          AND u.expires_at > now()
        ORDER BY u.created_at DESC
        LIMIT 1
      ) u ON true
      WHERE pzm.zone_id = ${zoneId}::uuid
        AND pzm.status = 'ACTIVE'
        AND pl.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
        AND (
          COALESCE(pls.status, 'OFFLINE') IN ('OPEN', 'BUSY')
          OR u.id IS NOT NULL
        )
        AND p.provider_type = ANY(${providerTypes})
    )
    SELECT
      location_id, provider_id, brand_name, display_name, provider_type,
      live_status, estimated_wait_minutes, live_message, tagline, sample_offering,
      update_id, update_title, update_description, source
    FROM live
    ORDER BY update_rank, status_rank, brand_name
    LIMIT ${limit}
  `;
}

export type LateDinnerNowRow = {
  offer_id: string;
  title: string;
  price_vnd: number;
  remaining_capacity: number;
  eta_minutes: number;
  location_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  live_status: string;
};

/** Tonight's late trays. Service date is the VN calendar day. */
export async function listLateDinnerNowInZone(
  sql: postgres.Sql,
  zoneId: string,
  serviceDate: string,
  limit = 3,
): Promise<LateDinnerNowRow[]> {
  return sql<LateDinnerNowRow[]>`
    SELECT
      o.id AS offer_id,
      o.title,
      o.price_vnd,
      o.remaining_capacity,
      o.eta_minutes,
      pl.id AS location_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      COALESCE(pls.status, 'OPEN') AS live_status
    FROM late_dinner_offers o
    INNER JOIN provider_locations pl ON pl.id = o.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm
      ON pzm.provider_location_id = pl.id
      AND pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE o.service_date = ${serviceDate}::date
      AND o.status = 'ACTIVE'
      AND o.remaining_capacity > 0
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY o.created_at DESC
    LIMIT ${limit}
  `;
}

export type LoyaltyProgramRow = {
  enabled: boolean;
  regular_threshold: number;
  vip_threshold: number;
};

export type LoyaltyBenefitRow = {
  id: string;
  tier: string;
  benefit_type: string;
  title: string;
  description: string | null;
  discount_percent: number | null;
  custom_text: string | null;
  active: boolean;
};

export async function getLoyaltyProgram(
  sql: postgres.Sql,
  locationId: string,
): Promise<LoyaltyProgramRow | null> {
  const rows = await sql<LoyaltyProgramRow[]>`
    SELECT enabled, regular_threshold, vip_threshold
    FROM provider_loyalty_programs
    WHERE provider_location_id = ${locationId}::uuid
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function listLoyaltyBenefits(
  sql: postgres.Sql,
  locationId: string,
): Promise<LoyaltyBenefitRow[]> {
  return sql<LoyaltyBenefitRow[]>`
    SELECT id, tier, benefit_type, title, description, discount_percent, custom_text, active
    FROM provider_loyalty_benefits
    WHERE provider_location_id = ${locationId}::uuid
    ORDER BY tier DESC, created_at ASC
  `;
}

/** Resolve customer label using program thresholds when enabled; else relationship_status. */
export async function resolveCustomerLoyaltyLabel(
  sql: postgres.Sql,
  locationId: string,
  customerUserId: string,
): Promise<{
  label: "NEW" | "RETURNING" | "REGULAR" | "VIP";
  completedInteractions: number;
  programEnabled: boolean;
}> {
  const rel = await sql<{ completed: string; status: string }[]>`
    SELECT completed_interactions::text AS completed, relationship_status AS status
    FROM user_provider_relationships
    WHERE user_id = ${customerUserId}::uuid
      AND provider_location_id = ${locationId}::uuid
    LIMIT 1
  `;
  const completed = Number(rel[0]?.completed ?? 0);
  const prog = await getLoyaltyProgram(sql, locationId);
  if (!prog?.enabled) {
    const status = (rel[0]?.status as "NEW" | "RETURNING" | "REGULAR" | "VIP") ?? "NEW";
    return { label: completed === 0 ? "NEW" : status, completedInteractions: completed, programEnabled: false };
  }
  let label: "NEW" | "RETURNING" | "REGULAR" | "VIP" = "NEW";
  if (completed >= prog.vip_threshold) label = "VIP";
  else if (completed >= prog.regular_threshold) label = "REGULAR";
  else if (completed >= 1) label = "RETURNING";
  return { label, completedInteractions: completed, programEnabled: true };
}
