/** Home merchandising surfaces. approved_surface is the customer source of truth. */
export const DISCOVERY_SURFACES = ["SPECIAL_TODAY", "SNACK_DESSERT", "MARKET_TODAY"] as const;

export type DiscoverySurface = (typeof DISCOVERY_SURFACES)[number];

export const DISCOVERY_SURFACE_LABEL: Record<DiscoverySurface, string> = {
  SPECIAL_TODAY: "Đặc biệt hôm nay",
  SNACK_DESSERT: "Ăn vặt & Tráng miệng",
  MARKET_TODAY: "Đi chợ ngay",
};

/** FOOD categories that route a push to Ăn vặt & Tráng miệng. Meal-side Tráng miệng / Đồ uống stay SPECIAL_TODAY. */
export const SNACK_CATEGORY_IDS = [
  "a1000001-0000-4000-8000-000000000101",
  "a1000001-0000-4000-8000-000000000102",
  "a1000001-0000-4000-8000-000000000103",
  "a1000001-0000-4000-8000-000000000104",
  "a1000001-0000-4000-8000-000000000105",
  "a1000001-0000-4000-8000-000000000106",
  "a1000001-0000-4000-8000-000000000107",
  "a1000001-0000-4000-8000-000000000108",
  "a1000001-0000-4000-8000-000000000109",
] as const;

const SNACK_CATEGORY_ID_SET = new Set<string>(SNACK_CATEGORY_IDS);

export function isDiscoverySurface(value: string | null | undefined): value is DiscoverySurface {
  return DISCOVERY_SURFACES.some((surface) => surface === value);
}

export function surfacesForCommerce(commerceModel: string | null | undefined): DiscoverySurface[] {
  if (commerceModel === "FRESH_MARKET" || commerceModel === "RETAIL_STORE") {
    return ["MARKET_TODAY"];
  }
  return ["SPECIAL_TODAY", "SNACK_DESSERT"];
}

/** Provider does not pick the rail. Classification only suggests one. */
export function suggestDiscoverySurface(input: {
  commerceModel: string | null | undefined;
  categoryId: string | null | undefined;
}): DiscoverySurface {
  const allowed = surfacesForCommerce(input.commerceModel);
  if (allowed.length === 1) return allowed[0]!;
  if (input.categoryId && SNACK_CATEGORY_ID_SET.has(input.categoryId)) return "SNACK_DESSERT";
  return "SPECIAL_TODAY";
}

export type MarketHeroCandidate = {
  providerId: string;
  providerClass: string;
};

/**
 * Newest pushes first, with a soft class penalty so one seller class does not fill the hero.
 * The penalty is not a fixed rotation of classes.
 */
export function rankMarketHero<T extends MarketHeroCandidate>(
  rows: readonly T[],
  limit: number,
  quotaPerProvider = 3,
): T[] {
  const pool = rows.slice(0, rows.length);
  const picked: T[] = [];
  const used = new Set<number>();
  const byProvider = new Map<string, number>();
  const byClass = new Map<string, number>();
  while (picked.length < limit) {
    let best: { index: number; score: number } | null = null;
    for (let index = 0; index < pool.length; index += 1) {
      if (used.has(index)) continue;
      const row = pool[index]!;
      if ((byProvider.get(row.providerId) ?? 0) >= quotaPerProvider) continue;
      const score = index + (byClass.get(row.providerClass) ?? 0) * 2;
      if (!best || score < best.score) best = { index, score };
    }
    if (!best) break;
    used.add(best.index);
    const row = pool[best.index]!;
    picked.push(row);
    byProvider.set(row.providerId, (byProvider.get(row.providerId) ?? 0) + 1);
    byClass.set(row.providerClass, (byClass.get(row.providerClass) ?? 0) + 1);
  }
  return picked;
}
