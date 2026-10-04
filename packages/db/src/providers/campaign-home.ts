import type postgres from "postgres";
import type { HomeSurfaceRow } from "../habit/queries.js";

export type CampaignHomeCard = HomeSurfaceRow & {
  campaign_id: string;
  campaign_type: string;
  location_name: string;
  commerce_model: string | null;
};

/** Approved chain campaigns that this Zone can show. Local hero rows stay in their own query. */
export async function listCampaignHomeCards(sql: postgres.Sql, zoneId: string): Promise<CampaignHomeCard[]> {
  return sql<CampaignHomeCard[]>`
    SELECT *
    FROM (
      SELECT DISTINCT ON (pl.id)
        (c.id::text || ':' || pl.id::text) AS id,
        c.id AS campaign_id,
        c.campaign_type,
        o.id AS offering_id,
        pl.id AS location_id,
        pl.display_name AS location_name,
        p.id AS provider_id,
        p.brand_name,
        p.provider_type,
        p.commerce_model,
        o.name AS title,
        CASE
          WHEN item.campaign_price IS NOT NULL THEN item.campaign_price
          WHEN item.discount_amount IS NOT NULL THEN GREATEST(
            COALESCE(loc_price.amount_vnd, master_price.amount_vnd, 0) - item.discount_amount,
            0
          )
          WHEN item.discount_percent IS NOT NULL THEN (
            COALESCE(loc_price.amount_vnd, master_price.amount_vnd, 0) * (100 - item.discount_percent)
          ) / 100
          ELSE COALESCE(day.price_override_vnd, loc_price.amount_vnd, master_price.amount_vnd, 0)
        END AS amount_vnd,
        COALESCE(loc_price.amount_vnd, master_price.amount_vnd, 0) AS list_amount_vnd,
        o.image_url,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        cat.name AS category_name,
        c.created_at
      FROM provider_campaigns c
      INNER JOIN provider_campaign_items item ON item.campaign_id = c.id AND item.offering_id IS NOT NULL
      INNER JOIN offerings o ON o.id = item.offering_id AND o.provider_id = c.provider_id
      INNER JOIN providers p ON p.id = c.provider_id
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
      INNER JOIN zones z ON z.id = pzm.zone_id
      INNER JOIN product_daily_availability day
        ON day.offering_id = o.id
       AND day.provider_location_id = pl.id
       AND day.service_date = (timezone('Asia/Ho_Chi_Minh', now()))::date
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      LEFT JOIN product_categories cat ON cat.id = o.category_id
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
        AND c.status = 'APPROVED'
        AND c.approval_status = 'APPROVED'
        AND c.content_revision = c.approved_revision
        AND c.starts_at <= now()
        AND c.ends_at > now()
        AND day.status = 'AVAILABLE'
        AND (day.available_qty IS NULL OR day.available_qty - day.reserved_qty - day.sold_qty > 0)
        AND EXISTS (
          SELECT 1
          FROM provider_campaign_targets t
          WHERE t.campaign_id = c.id
            AND (
              (t.target_type = 'PROVIDER' AND t.target_id = c.provider_id)
              OR (t.target_type = 'CITY' AND t.target_id = z.city_id)
              OR (t.target_type = 'ZONE' AND t.target_id = pzm.zone_id)
              OR (t.target_type = 'LOCATION' AND t.target_id = pl.id)
            )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM provider_campaign_suppressions s
          WHERE s.campaign_id = c.id
            AND s.zone_id = pzm.zone_id
            AND s.lifted_at IS NULL
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND (s.provider_location_id IS NULL OR s.provider_location_id = pl.id)
        )
      ORDER BY pl.id, item.hero_priority NULLS LAST, c.created_at DESC
    ) picked
    ORDER BY created_at DESC
  `;
}
