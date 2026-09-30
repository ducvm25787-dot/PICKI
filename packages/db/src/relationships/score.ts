/** Configurable familiarity weights — no magic numbers in UI. */

export type FamiliarityWeights = {
  completed: number;
  repeatBonus: number;
  /** Max points from recency (decays over this many days) */
  recencyMax: number;
  recencyHalfLifeDays: number;
  favorite: number;
  regularThreshold: number;
  vipThreshold: number;
};

export type RelationshipStatus = "NEW" | "RETURNING" | "REGULAR" | "VIP";

const DEFAULTS: FamiliarityWeights = {
  completed: 10,
  repeatBonus: 20,
  recencyMax: 30,
  recencyHalfLifeDays: 30,
  favorite: 25,
  regularThreshold: 5,
  vipThreshold: 15,
};

function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function familiarityWeights(): FamiliarityWeights {
  return {
    completed: envInt("FAMILIARITY_WEIGHT_COMPLETED", DEFAULTS.completed),
    repeatBonus: envInt("FAMILIARITY_WEIGHT_REPEAT", DEFAULTS.repeatBonus),
    recencyMax: envInt("FAMILIARITY_WEIGHT_RECENCY_MAX", DEFAULTS.recencyMax),
    recencyHalfLifeDays: envInt("FAMILIARITY_RECENCY_HALF_LIFE_DAYS", DEFAULTS.recencyHalfLifeDays),
    favorite: envInt("FAMILIARITY_WEIGHT_FAVORITE", DEFAULTS.favorite),
    regularThreshold: envInt("FAMILIARITY_REGULAR_THRESHOLD", DEFAULTS.regularThreshold),
    vipThreshold: envInt("FAMILIARITY_VIP_THRESHOLD", DEFAULTS.vipThreshold),
  };
}

/** postgres.js returns timestamptz aggregates (MAX) as strings, not Date. */
export function asInteractionDate(value: Date | string | null | undefined): Date | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computeRelationshipScore(input: {
  completedInteractions: number;
  lastInteractionAt: Date | string | null;
  favorite: boolean;
  now?: Date;
  weights?: FamiliarityWeights;
}): { score: number; status: RelationshipStatus } {
  const w = input.weights ?? familiarityWeights();
  const completed = Math.max(0, input.completedInteractions);
  let score = completed * w.completed;
  if (completed >= 2) score += w.repeatBonus;
  if (input.favorite) score += w.favorite;

  const lastAt = asInteractionDate(input.lastInteractionAt);
  if (lastAt) {
    const now = input.now ?? new Date();
    const days = (now.getTime() - lastAt.getTime()) / (1000 * 60 * 60 * 24);
    const half = Math.max(1, w.recencyHalfLifeDays);
    const decay = Math.pow(0.5, Math.max(0, days) / half);
    score += Math.round(w.recencyMax * decay);
  }

  let status: RelationshipStatus = "NEW";
  if (completed >= w.vipThreshold) status = "VIP";
  else if (completed >= w.regularThreshold) status = "REGULAR";
  else if (completed >= 1) status = "RETURNING";

  return { score: Math.max(0, Math.round(score)), status };
}

/** Shelf eligibility: repeat usage or explicit favorite; not hidden. */
export function isFamiliarShelfEligible(input: {
  completedInteractions: number;
  favorite: boolean;
  hiddenByUser: boolean;
}): boolean {
  if (input.hiddenByUser) return false;
  return input.completedInteractions >= 2 || input.favorite;
}
