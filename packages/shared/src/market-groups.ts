/** Fresh groups for Chợ and Cửa hàng. Ids match product_categories from market commerce. */
export const FRESH_CATEGORY = {
  veg: "a1000002-0000-4000-8000-000000000001",
  fruit: "a1000002-0000-4000-8000-000000000002",
  meat: "a1000002-0000-4000-8000-000000000003",
  seafood: "a1000002-0000-4000-8000-000000000004",
  poultry: "a1000002-0000-4000-8000-000000000005",
  eggs: "a1000002-0000-4000-8000-000000000006",
  country: "a1000002-0000-4000-8000-000000000007",
} as const;

export type MarketGroup = {
  id: string;
  label: string;
  categoryIds: readonly string[];
};

export const CLUSTER_STALL_GROUPS: readonly MarketGroup[] = [
  { id: "meat", label: "Thịt", categoryIds: [FRESH_CATEGORY.meat] },
  { id: "poultry", label: "Gia cầm", categoryIds: [FRESH_CATEGORY.poultry, FRESH_CATEGORY.eggs] },
  { id: "seafood", label: "Cá & Hải sản", categoryIds: [FRESH_CATEGORY.seafood] },
  { id: "veg", label: "Rau & Củ", categoryIds: [FRESH_CATEGORY.veg] },
  { id: "fruit", label: "Trái cây", categoryIds: [FRESH_CATEGORY.fruit] },
  { id: "other", label: "Khác", categoryIds: [] },
];

export const STORE_GROUPS: readonly MarketGroup[] = [
  { id: "seafood", label: "Hải sản", categoryIds: [FRESH_CATEGORY.seafood] },
  { id: "meat", label: "Thịt", categoryIds: [FRESH_CATEGORY.meat] },
  { id: "poultry", label: "Gia cầm / Gà quê", categoryIds: [FRESH_CATEGORY.poultry, FRESH_CATEGORY.eggs] },
  { id: "veg", label: "Rau sạch", categoryIds: [FRESH_CATEGORY.veg] },
  { id: "fruit", label: "Trái cây", categoryIds: [FRESH_CATEGORY.fruit] },
  { id: "country", label: "Đồ quê / đặc sản", categoryIds: [FRESH_CATEGORY.country] },
  { id: "other", label: "Khác", categoryIds: [] },
];

export function groupForCategory(
  groups: readonly MarketGroup[],
  categoryId: string | null | undefined,
): MarketGroup {
  const other = groups.find((group) => group.id === "other") ?? groups[groups.length - 1]!;
  if (!categoryId) return other;
  return groups.find((group) => group.categoryIds.includes(categoryId)) ?? other;
}
