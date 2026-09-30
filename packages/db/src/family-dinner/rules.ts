export const FAMILY_DINNER_CATEGORY_LIMITS = {
  MAIN: 10,
  SIDE: 10,
  VEGETABLE: 5,
  SOUP: 5,
  RICE: 5,
  EXTRA: 99,
} as const;

export type FamilyDinnerCategory = keyof typeof FAMILY_DINNER_CATEGORY_LIMITS;

export const FAMILY_DINNER_REQUIRED_CATEGORIES: FamilyDinnerCategory[] = [
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
];

/** Bắt buộc trên menu ngày của bếp (khách có thể không chọn Cơm khi đặt). */
export const FAMILY_DINNER_MENU_REQUIRED_CATEGORIES: FamilyDinnerCategory[] = [
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
  "RICE",
];

/** Gợi ý món cho provider khi tạo menu ngày (có thể gõ tay khác). */
export const FAMILY_DINNER_DISH_SUGGESTIONS: Record<
  Exclude<FamilyDinnerCategory, "EXTRA">,
  readonly string[]
> = {
  MAIN: [
    "Thịt rang cháy cạnh",
    "Cá trắm kho riềng",
    "Gà rang gừng",
    "Sườn xào chua ngọt",
    "Cá sốt cà chua",
    "Bò xào cần tỏi",
    "Thịt kho trứng",
    "Gà om nấm",
    "Tôm rang thịt",
    "Thịt viên sốt cà",
  ],
  SIDE: [
    "Đậu phụ tẩm hành",
    "Trứng rán hành",
    "Đậu phụ sốt cà",
    "Trứng hấp thịt",
    "Khoai tây xào bơ tỏi / chiên",
    "Nem rán",
    "Lạc rang muối",
  ],
  VEGETABLE: [
    "Rau muống luộc",
    "Cải xào",
    "Rau củ luộc chấm muối lạc",
    "Cà muối",
    "Dưa muối",
  ],
  SOUP: [
    "Canh cua mồng tơi mướp",
    "Canh bí đỏ thịt băm",
    "Canh rau ngót thịt băm",
    "Canh ngao nấu chua",
    "Canh rau củ ninh xương",
  ],
  RICE: ["Cơm trắng", "Cơm gạo lứt", "Cơm nắm"],
};

export const FAMILY_DINNER_DEFAULT_PRICES_VND: Record<
  Exclude<FamilyDinnerCategory, "EXTRA">,
  number
> = {
  MAIN: 109_000,
  SIDE: 39_000,
  VEGETABLE: 29_000,
  SOUP: 69_000,
  RICE: 15_000,
};

export function isFamilyDinnerCategory(value: string): value is FamilyDinnerCategory {
  return value in FAMILY_DINNER_CATEGORY_LIMITS;
}

const FAMILY_DINNER_MEAL_CATEGORIES: FamilyDinnerCategory[] = [
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
  "RICE",
];

/**
 * Customer tray: every course can be skipped.
 * Checkout needs at least one dish among chính, phụ, rau, canh, or cơm.
 * `missing` lists the four classic groups that were skipped, for a hint only.
 */
export function validateFamilyDinnerBaseMeal(
  lines: { category: string; quantity: number }[],
): { ok: true; missing: FamilyDinnerCategory[] } | { ok: false; missing: FamilyDinnerCategory[] } {
  const present = new Set<FamilyDinnerCategory>();
  for (const line of lines) {
    if (line.quantity < 1) continue;
    if (isFamilyDinnerCategory(line.category) && line.category !== "EXTRA") {
      present.add(line.category);
    }
  }
  const missing = FAMILY_DINNER_REQUIRED_CATEGORIES.filter((c) => !present.has(c));
  const hasMeal = FAMILY_DINNER_MEAL_CATEGORIES.some((c) => present.has(c));
  if (!hasMeal) return { ok: false, missing };
  return { ok: true, missing };
}

/** Menu ngày bếp: đủ nhóm bắt buộc kể cả Cơm. */
export function validateFamilyDinnerDailyMenu(
  lines: { category: string; quantity: number }[],
): { ok: true } | { ok: false; missing: FamilyDinnerCategory[] } {
  const present = new Set<FamilyDinnerCategory>();
  for (const line of lines) {
    if (line.quantity < 1) continue;
    if (isFamilyDinnerCategory(line.category) && line.category !== "EXTRA") {
      present.add(line.category);
    }
  }
  const missing = FAMILY_DINNER_MENU_REQUIRED_CATEGORIES.filter((c) => !present.has(c));
  if (missing.length > 0) return { ok: false, missing };
  return { ok: true };
}

/** Nhóm được phép tick «Cho phép tự nấu» (không áp RICE/EXTRA). */
export const FAMILY_DINNER_SELF_COOK_CATEGORIES: FamilyDinnerCategory[] = [
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
];

export type FamilyDinnerPrepMode = "READY_COOKED" | "SELF_COOK";

export function isFamilyDinnerSelfCookCategory(category: string): boolean {
  return (FAMILY_DINNER_SELF_COOK_CATEGORIES as string[]).includes(category);
}

/** Phụ thu mỗi suất cơm thêm (sau suất đầu theo giá menu). */
export const FAMILY_DINNER_RICE_EXTRA_PORTION_VND = 5_000;

/** Tổng tiền dòng cơm: suất 1 = giá menu; mỗi suất thêm +5.000đ. */
export function familyDinnerRiceLineTotalVnd(basePriceVnd: number, quantity: number): number {
  const q = Math.max(0, Math.floor(quantity));
  if (q <= 0) return 0;
  return basePriceVnd + (q - 1) * FAMILY_DINNER_RICE_EXTRA_PORTION_VND;
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
