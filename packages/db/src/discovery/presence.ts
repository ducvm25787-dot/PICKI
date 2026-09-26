import type postgres from "postgres";
import { freshnessLabel, locationFreshness, promotionKindLabel } from "./freshness.js";

export type PresenceRow = {
  location_id: string;
  brand_name: string;
  provider_type: string;
  live_status: string;
  opens_at: Date | null;
  created_at: Date;
  sample_offering: string | null;
  promo_id: string | null;
  promo_kind: string | null;
  promo_title: string | null;
  promo_detail: string | null;
  promo_spotlight: boolean | null;
  promo_ends_at: Date | null;
};

export type PresenceCard = {
  locationId: string;
  brandName: string;
  providerType: string;
  liveStatus: string;
  freshness: "UPCOMING" | "NEW" | null;
  freshnessLabel: string | null;
  opensAt: string | null;
  sampleOffering: string | null;
  promotion: {
    id: string;
    kind: string;
    kindLabel: string;
    title: string;
    detail: string | null;
    spotlight: boolean;
    endsAt: string;
  } | null;
};

function toCard(row: PresenceRow, now: Date): PresenceCard {
  const freshness = locationFreshness(row.opens_at, row.created_at, now);
  return {
    locationId: row.location_id,
    brandName: row.brand_name,
    providerType: row.provider_type,
    liveStatus: row.live_status,
    freshness,
    freshnessLabel: freshnessLabel(freshness),
    opensAt: row.opens_at ? new Date(row.opens_at).toISOString() : null,
    sampleOffering: row.sample_offering,
    promotion: row.promo_id
      ? {
          id: row.promo_id,
          kind: row.promo_kind ?? "DISCOUNT",
          kindLabel: promotionKindLabel(row.promo_kind ?? ""),
          title: row.promo_title ?? "",
          detail: row.promo_detail,
          spotlight: Boolean(row.promo_spotlight),
          endsAt: row.promo_ends_at ? new Date(row.promo_ends_at).toISOString() : "",
        }
      : null,
  };
}

const presenceSelect = `
  pl.id AS location_id,
  p.brand_name,
  p.provider_type,
  COALESCE(pls.status, 'OFFLINE') AS live_status,
  pl.opens_at,
  pl.created_at,
  (
    SELECT o.name FROM offerings o
    WHERE o.provider_id = p.id AND o.status = 'ACTIVE'
    ORDER BY o.sort_order LIMIT 1
  ) AS sample_offering,
  pr.id AS promo_id,
  pr.kind AS promo_kind,
  pr.title AS promo_title,
  pr.detail AS promo_detail,
  pr.spotlight AS promo_spotlight,
  pr.ends_at AS promo_ends_at
`;

/** One organic new/upcoming location for the Now shelf. Not a paid slot. */
export async function listOrganicFreshInZone(
  sql: postgres.Sql,
  zoneId: string,
): Promise<PresenceCard | null> {
  const now = new Date();
  const rows = await sql<PresenceRow[]>`
    SELECT ${sql.unsafe(presenceSelect)}
    FROM provider_zone_memberships pzm
    INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    LEFT JOIN LATERAL (
      SELECT id, kind, title, detail, spotlight, ends_at
      FROM provider_promotions
      WHERE provider_location_id = pl.id
        AND zone_id = ${zoneId}::uuid
        AND spotlight = false
        AND starts_at <= now()
        AND ends_at > now()
      ORDER BY created_at DESC
      LIMIT 1
    ) pr ON true
    WHERE pzm.zone_id = ${zoneId}::uuid
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND (
        (pl.opens_at IS NOT NULL AND pl.opens_at > now())
        OR (pl.opens_at IS NOT NULL AND pl.opens_at <= now() AND pl.opens_at > now() - interval '14 days')
        OR (pl.opens_at IS NULL AND pl.created_at > now() - interval '14 days')
      )
    ORDER BY
      CASE WHEN pl.opens_at IS NOT NULL AND pl.opens_at > now() THEN 0 ELSE 1 END,
      pl.opens_at DESC NULLS LAST,
      pl.created_at DESC
    LIMIT 1
  `;
  return rows[0] ? toCard(rows[0], now) : null;
}

/** One in-window, non-spotlight promotion for the Now shelf. */
export async function listLiveDealInZone(
  sql: postgres.Sql,
  zoneId: string,
): Promise<PresenceCard | null> {
  const now = new Date();
  const rows = await sql<PresenceRow[]>`
    SELECT ${sql.unsafe(presenceSelect)}
    FROM provider_promotions pr
    INNER JOIN provider_locations pl ON pl.id = pr.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pr.zone_id = ${zoneId}::uuid
      AND pr.spotlight = false
      AND pr.starts_at <= now()
      AND pr.ends_at > now()
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY pr.ends_at ASC
    LIMIT 1
  `;
  return rows[0] ? toCard(rows[0], now) : null;
}

/** Paid reach. Labeled separately. Never merged into familiarity score. */
export async function listSpotlightInZone(
  sql: postgres.Sql,
  zoneId: string,
): Promise<PresenceCard | null> {
  const now = new Date();
  const rows = await sql<PresenceRow[]>`
    SELECT ${sql.unsafe(presenceSelect)}
    FROM provider_promotions pr
    INNER JOIN provider_locations pl ON pl.id = pr.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE pr.zone_id = ${zoneId}::uuid
      AND pr.spotlight = true
      AND pr.starts_at <= now()
      AND pr.ends_at > now()
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
    ORDER BY pr.created_at DESC
    LIMIT 1
  `;
  return rows[0] ? toCard(rows[0], now) : null;
}

export async function listPresenceForLocations(
  sql: postgres.Sql,
  locationIds: string[],
): Promise<Map<string, PresenceCard>> {
  const map = new Map<string, PresenceCard>();
  if (locationIds.length === 0) return map;
  const now = new Date();
  const rows = await sql<PresenceRow[]>`
    SELECT ${sql.unsafe(presenceSelect)}
    FROM provider_locations pl
    INNER JOIN providers p ON p.id = pl.provider_id
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    LEFT JOIN LATERAL (
      SELECT id, kind, title, detail, spotlight, ends_at
      FROM provider_promotions
      WHERE provider_location_id = pl.id
        AND starts_at <= now()
        AND ends_at > now()
      ORDER BY spotlight DESC, created_at DESC
      LIMIT 1
    ) pr ON true
    WHERE pl.id = ANY(${locationIds}::uuid[])
  `;
  for (const row of rows) {
    map.set(row.location_id, toCard(row, now));
  }
  return map;
}
