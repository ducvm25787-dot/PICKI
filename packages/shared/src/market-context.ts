/** Entry context chooses delivery. Provider type never does. */
export type MarketEntry = "CLUSTER" | "STORE";

export type MarketCommerceContext = "DIRECT" | "MARKET_TRIP";

export const P6_TRIP_CART_KEY = "picki_market_trip";
export const P6_DIRECT_CART_KEY = "picki_market_direct";

export const CONVENIENCE_SURFACE_TYPES = ["MINIMART", "CONVENIENCE_STORE"] as const;

const FRESH_TODAY_EXCLUDED = new Set([
  "MINIMART",
  "CONVENIENCE_STORE",
  "SUPERMARKET",
  "RETAIL_STORE",
]);

export function commerceContextForEntry(entry: MarketEntry): MarketCommerceContext {
  return entry === "CLUSTER" ? "MARKET_TRIP" : "DIRECT";
}

/** Hôm nay có is a direct visit. Cluster membership does not turn it into a market trip. */
export function marketEntryFromQuery(context: string | null | undefined): MarketEntry | null {
  const value = context?.trim().toUpperCase();
  if (value === "DIRECT") return "STORE";
  if (value === "MARKET_TRIP") return "CLUSTER";
  return null;
}

export function onConvenienceSurface(providerType: string | null | undefined): boolean {
  return providerType === "MINIMART" || providerType === "CONVENIENCE_STORE";
}

/** Promotional rail. An approved post is still required by the home query. */
export function freshTodayEligible(input: {
  providerType: string;
  marketClusterId: string | null;
}): boolean {
  if (FRESH_TODAY_EXCLUDED.has(input.providerType)) return false;
  return input.providerType === "SPECIALTY_STORE" || input.marketClusterId != null;
}

export type P6CartSnapshot = {
  trip: string | null;
  direct: string | null;
};

/** The open route picks which cart is shown. The other cart stays stored. */
export function p6CartAfterNavigation(stored: P6CartSnapshot, entry: MarketEntry): P6CartSnapshot & {
  shownKey: typeof P6_TRIP_CART_KEY | typeof P6_DIRECT_CART_KEY;
} {
  return {
    trip: stored.trip,
    direct: stored.direct,
    shownKey: entry === "CLUSTER" ? P6_TRIP_CART_KEY : P6_DIRECT_CART_KEY,
  };
}

export type MarketStallZone = {
  marketClusterId: string | null;
  servingZoneIds: readonly string[];
};

/**
 * Cluster zone, basket zone, and each stall's active zone membership must be the same zone.
 * Returns a reason code, or null when the basket may proceed.
 */
export function marketZoneMismatch(input: {
  clusterId: string;
  clusterZoneId: string;
  basketZoneId: string;
  stalls: readonly MarketStallZone[];
}): "BASKET_ZONE" | "STALL_CLUSTER" | "STALL_ZONE" | null {
  if (input.clusterZoneId !== input.basketZoneId) return "BASKET_ZONE";
  for (const stall of input.stalls) {
    if (stall.marketClusterId !== input.clusterId) return "STALL_CLUSTER";
    if (!stall.servingZoneIds.includes(input.basketZoneId)) return "STALL_ZONE";
  }
  return null;
}
