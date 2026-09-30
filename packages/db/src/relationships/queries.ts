import type postgres from "postgres";
import {
  asInteractionDate,
  computeRelationshipScore,
  familiarityWeights,
  isFamiliarShelfEligible,
  type RelationshipStatus,
} from "./score.js";

export type FamiliarProviderRow = {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  live_status: string;
  estimated_wait_minutes: number | null;
  completed_interactions: number;
  relationship_score: number;
  relationship_status: RelationshipStatus;
  favorite: boolean;
  last_interaction_at: Date | null;
  lat: number | null;
  lng: number | null;
};

const COMPLETED_STATUSES = ["DELIVERED", "COMPLETED"] as const;

/** Recompute from orders + favorite flag; upsert relationship row. */
export async function upsertRelationshipFromOrders(
  sql: postgres.Sql,
  userId: string,
  locationId: string,
): Promise<void> {
  const stats = await sql<{ cnt: string; last_at: Date | null }[]>`
    SELECT COUNT(*)::text AS cnt, MAX(updated_at) AS last_at
    FROM orders
    WHERE customer_user_id = ${userId}::uuid
      AND provider_location_id = ${locationId}::uuid
      AND status = ANY(${COMPLETED_STATUSES})
  `;
  const completed = Number(stats[0]?.cnt ?? 0);
  const lastAt = asInteractionDate(stats[0]?.last_at ?? null);
  const lastAtParam = lastAt ? lastAt.toISOString() : null;

  const fav = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM user_favorites
      WHERE user_id = ${userId}::uuid
        AND provider_location_id = ${locationId}::uuid
    ) AS exists
  `;
  const favorite = Boolean(fav[0]?.exists);

  const existing = await sql<{ hidden_by_user: boolean }[]>`
    SELECT hidden_by_user FROM user_provider_relationships
    WHERE user_id = ${userId}::uuid AND provider_location_id = ${locationId}::uuid
    LIMIT 1
  `;
  const hidden = existing[0]?.hidden_by_user ?? false;

  const { score, status } = computeRelationshipScore({
    completedInteractions: completed,
    lastInteractionAt: lastAt,
    favorite,
  });

  await sql`
    INSERT INTO user_provider_relationships (
      user_id,
      provider_location_id,
      favorite,
      completed_interactions,
      last_interaction_at,
      relationship_score,
      relationship_status,
      hidden_by_user,
      updated_at
    ) VALUES (
      ${userId}::uuid,
      ${locationId}::uuid,
      ${favorite},
      ${completed},
      ${lastAtParam}::timestamptz,
      ${score},
      ${status},
      ${hidden},
      now()
    )
    ON CONFLICT (user_id, provider_location_id) DO UPDATE SET
      favorite = EXCLUDED.favorite,
      completed_interactions = EXCLUDED.completed_interactions,
      last_interaction_at = EXCLUDED.last_interaction_at,
      relationship_score = EXCLUDED.relationship_score,
      relationship_status = EXCLUDED.relationship_status,
      updated_at = now()
  `;
}

export async function syncRelationshipFavorite(
  sql: postgres.Sql,
  userId: string,
  locationId: string,
  favorite: boolean,
): Promise<void> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM user_provider_relationships
    WHERE user_id = ${userId}::uuid AND provider_location_id = ${locationId}::uuid
    LIMIT 1
  `;
  if (existing[0]) {
    await upsertRelationshipFromOrders(sql, userId, locationId);
    return;
  }
  if (!favorite) return;
  const { score, status } = computeRelationshipScore({
    completedInteractions: 0,
    lastInteractionAt: null,
    favorite: true,
  });
  await sql`
    INSERT INTO user_provider_relationships (
      user_id, provider_location_id, favorite, completed_interactions,
      relationship_score, relationship_status, updated_at
    ) VALUES (
      ${userId}::uuid, ${locationId}::uuid, true, 0, ${score}, ${status}, now()
    )
    ON CONFLICT (user_id, provider_location_id) DO UPDATE SET
      favorite = true,
      relationship_score = EXCLUDED.relationship_score,
      relationship_status = EXCLUDED.relationship_status,
      updated_at = now()
  `;
}

export async function hideFamiliarSuggestion(
  sql: postgres.Sql,
  userId: string,
  locationId: string,
): Promise<void> {
  await sql`
    INSERT INTO user_provider_relationships (
      user_id, provider_location_id, hidden_by_user, updated_at
    ) VALUES (${userId}::uuid, ${locationId}::uuid, true, now())
    ON CONFLICT (user_id, provider_location_id) DO UPDATE SET
      hidden_by_user = true,
      updated_at = now()
  `;
}

/** Familiar shelf for a Zone (membership filter). */
export async function listFamiliarProvidersInZone(
  sql: postgres.Sql,
  userId: string,
  zoneId: string,
  limit = 8,
): Promise<FamiliarProviderRow[]> {
  const rows = await sql<FamiliarProviderRow[]>`
    SELECT
      pl.id AS location_id,
      p.id AS provider_id,
      p.brand_name,
      pl.display_name,
      p.provider_type,
      COALESCE(pls.status, 'OFFLINE') AS live_status,
      pls.estimated_wait_minutes,
      upr.completed_interactions,
      upr.relationship_score,
      upr.relationship_status,
      upr.favorite,
      upr.last_interaction_at,
      pl.lat,
      pl.lng
    FROM user_provider_relationships upr
    INNER JOIN provider_locations pl ON pl.id = upr.provider_location_id
    INNER JOIN providers p ON p.id = pl.provider_id
    INNER JOIN provider_zone_memberships pzm
      ON pzm.provider_location_id = pl.id AND pzm.zone_id = ${zoneId}::uuid
    LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
    WHERE upr.user_id = ${userId}::uuid
      AND upr.hidden_by_user = false
      AND pzm.status = 'ACTIVE'
      AND pl.status = 'ACTIVE'
      AND p.status = 'ACTIVE'
      AND (
        upr.completed_interactions >= 2
        OR upr.favorite = true
      )
    ORDER BY upr.relationship_score DESC, upr.last_interaction_at DESC NULLS LAST
    LIMIT ${limit}
  `;
  return rows.filter((r) =>
    isFamiliarShelfEligible({
      completedInteractions: r.completed_interactions,
      favorite: r.favorite,
      hiddenByUser: false,
    }),
  );
}

/** Backfill all user×location pairs that have completed orders or favorites. */
export async function backfillAllRelationships(sql: postgres.Sql): Promise<number> {
  const pairs = await sql<{ user_id: string; provider_location_id: string }[]>`
    SELECT DISTINCT customer_user_id AS user_id, provider_location_id
    FROM orders
    WHERE status = ANY(${COMPLETED_STATUSES})
    UNION
    SELECT user_id, provider_location_id FROM user_favorites
  `;
  for (const p of pairs) {
    await upsertRelationshipFromOrders(sql, p.user_id, p.provider_location_id);
  }
  return pairs.length;
}
