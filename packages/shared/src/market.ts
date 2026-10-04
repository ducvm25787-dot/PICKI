/** Catalog publish caps. API config, not a database constraint. */
export const MARKET_CATALOG_CAP: Record<string, number> = {
  MARKET_VENDOR: 40,
  MINIMART: 100,
  RETAIL_STORE: 100,
  SUPERMARKET: 100,
};

export const MARKET_FEATURED_QUOTA = 3;

export const MARKET_UNITS = [
  "kg",
  "500g",
  "con",
  "bó",
  "túi",
  "khay",
  "hộp",
  "chai",
  "lon",
  "gói",
  "set",
] as const;

export type MarketUnit = (typeof MARKET_UNITS)[number];

export function marketTierBadge(providerType: string | null | undefined): string | null {
  if (providerType === "MARKET_VENDOR") return "Tiểu thương";
  if (providerType === "MINIMART") return "Tạp hóa";
  if (providerType === "RETAIL_STORE") return "Cửa hàng chuyên";
  if (providerType === "SUPERMARKET") return "Siêu thị";
  return null;
}

export function isMarketProviderType(providerType: string | null | undefined): boolean {
  return marketTierBadge(providerType) != null;
}
