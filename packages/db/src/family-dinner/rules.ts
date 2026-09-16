export const FAMILY_DINNER_CATEGORY_LIMITS = {
  MAIN: 5,
  SIDE: 4,
  VEGETABLE: 3,
  SOUP: 3,
  EXTRA: 99,
} as const;

export type FamilyDinnerCategory = keyof typeof FAMILY_DINNER_CATEGORY_LIMITS;

export const FAMILY_DINNER_REQUIRED_CATEGORIES: FamilyDinnerCategory[] = [
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
];

export function isFamilyDinnerCategory(value: string): value is FamilyDinnerCategory {
  return value in FAMILY_DINNER_CATEGORY_LIMITS;
}

/** Base meal: ≥1 item in each required category (by line presence, qty≥1). */
export function validateFamilyDinnerBaseMeal(
  lines: { category: string; quantity: number }[],
): { ok: true } | { ok: false; missing: FamilyDinnerCategory[] } {
  const present = new Set<FamilyDinnerCategory>();
  for (const line of lines) {
    if (line.quantity < 1) continue;
    if (isFamilyDinnerCategory(line.category) && line.category !== "EXTRA") {
      present.add(line.category);
    }
  }
  const missing = FAMILY_DINNER_REQUIRED_CATEGORIES.filter((c) => !present.has(c));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

export function countFamilyDinnerPortions(lines: { quantity: number }[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Deterministic gross from net + yield% (never LLM). */
export function grossFromNet(net: number, yieldPercent: number): number {
  const y = yieldPercent > 0 ? yieldPercent : 100;
  return Math.round((net / (y / 100)) * 1000) / 1000;
}

export function toBuyQuantity(grossRequired: number, onHand: number): number {
  return Math.max(0, Math.round((grossRequired - onHand) * 1000) / 1000);
}

/** Late tray capacity = min remaining across selected dishes (per tray qty). */
export function lateOfferMaxCapacity(
  lines: { remaining: number; quantityPerTray: number }[],
): number {
  if (lines.length === 0) return 0;
  let max = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    const per = Math.max(1, line.quantityPerTray);
    max = Math.min(max, Math.floor(line.remaining / per));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}
