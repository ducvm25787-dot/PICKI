import type { PickiSql } from "../client.js";

export type LocationMenuRow = {
  offering_id: string;
  slug: string;
  name: string;
  description: string | null;
  amount_vnd: number;
  pricing_kind: string;
  food_moment: string | null;
  fulfillment_mode: string | null;
  education_subject: string | null;
  education_grade: string | null;
  payment_policy: string | null;
  alcohol_restricted: boolean;
  estimated_days: number | null;
  image_url: string | null;
  unit: string | null;
  prep_time_minutes: number | null;
  category_id: string | null;
  category_name: string | null;
  day_status: string | null;
  available_qty: number | null;
  reserved_qty: number | null;
  sold_qty: number | null;
  price_override_vnd: number | null;
};

export type LocationHeaderRow = {
  location_id: string;
  provider_id: string;
  provider_type: string;
  brand_name: string;
  display_name: string;
  live_status: string;
  tagline: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  prep_minutes: number | null;
  eta_minutes: number | null;
  estimated_wait_minutes: number | null;
  live_message: string | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  verification_status: string;
};

export async function getLocationHeader(
  sql: PickiSql,
  locationId: string,
): Promise<LocationHeaderRow | undefined> {
  const rows = await sql<LocationHeaderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.provider_type,
      p.brand_name,
      pl.display_name,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pp.tagline,
      pp.description,
      pp.logo_url,
      pp.cover_url,
      pls.prep_minutes,
      pls.eta_minutes,
      pls.estimated_wait_minutes,
      pls.message AS live_message,
      pl.address_line,
      pl.lat,
      pl.lng,
      pl.verification_status
    FROM provider_locations pl
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pl.id = ${locationId}::uuid
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    LIMIT 1
  `;
  return rows[0];
}

/** Location price wins; falls back to master (null location) price. */
export async function listLocationMenu(
  sql: PickiSql,
  locationId: string,
  serviceDate?: string | null,
): Promise<LocationMenuRow[]> {
  return sql<LocationMenuRow[]>`
    SELECT
      o.id AS offering_id,
      o.slug,
      o.name,
      o.description,
      COALESCE(loc_price.amount_vnd, master_price.amount_vnd) AS amount_vnd,
      COALESCE(loc_price.pricing_kind, master_price.pricing_kind) AS pricing_kind,
      o.food_moment,
      o.fulfillment_mode,
      o.education_subject,
      o.education_grade,
      o.payment_policy,
      o.alcohol_restricted,
      o.estimated_days,
      o.image_url,
      o.unit,
      o.prep_time_minutes,
      o.category_id,
      cat.name AS category_name,
      day.status AS day_status,
      day.available_qty,
      day.reserved_qty,
      day.sold_qty,
      day.price_override_vnd
    FROM offerings o
    INNER JOIN provider_locations pl ON pl.provider_id = o.provider_id
    LEFT JOIN offering_prices loc_price
      ON loc_price.offering_id = o.id
      AND loc_price.provider_location_id = pl.id
    LEFT JOIN offering_prices master_price
      ON master_price.offering_id = o.id
      AND master_price.provider_location_id IS NULL
    LEFT JOIN product_categories cat ON cat.id = o.category_id
    LEFT JOIN product_daily_availability day
      ON day.offering_id = o.id
      AND day.provider_location_id = pl.id
      AND day.service_date = COALESCE(${serviceDate ?? null}::date, (timezone('Asia/Ho_Chi_Minh', now()))::date)
    WHERE pl.id = ${locationId}::uuid
      AND o.status = 'ACTIVE'
      AND (loc_price.id IS NOT NULL OR master_price.id IS NOT NULL)
    ORDER BY o.sort_order, o.name
  `;
}
