import { describe, expect, it } from "vitest";
import {
  CONVENIENCE_SURFACE_TYPES,
  P6_DIRECT_CART_KEY,
  P6_TRIP_CART_KEY,
  commerceContextForEntry,
  freshTodayEligible,
  marketEntryFromQuery,
  marketZoneMismatch,
  onConvenienceSurface,
  p6CartAfterNavigation,
} from "./market-context.js";

describe("P6 entry context", () => {
  it("lets the entry choose delivery and ignores provider type", () => {
    expect(commerceContextForEntry("CLUSTER")).toBe("MARKET_TRIP");
    expect(commerceContextForEntry("STORE")).toBe("DIRECT");
    expect(commerceContextForEntry.length).toBe(1);
    expect(marketEntryFromQuery("DIRECT")).toBe("STORE");
    expect(marketEntryFromQuery("direct")).toBe("STORE");
    expect(marketEntryFromQuery("MARKET_TRIP")).toBe("CLUSTER");
    expect(marketEntryFromQuery("market_trip")).toBe("CLUSTER");
    expect(marketEntryFromQuery(null)).toBeNull();
  });

  it("keeps both P6 carts when the customer switches entry", () => {
    const stored = { trip: "thit+rau", direct: "tom-2kg" };
    const inStore = p6CartAfterNavigation(stored, "STORE");
    expect(inStore.shownKey).toBe(P6_DIRECT_CART_KEY);
    expect(inStore.trip).toBe("thit+rau");
    expect(inStore.direct).toBe("tom-2kg");
    const backToCluster = p6CartAfterNavigation(
      { trip: inStore.trip, direct: inStore.direct },
      "CLUSTER",
    );
    expect(backToCluster.shownKey).toBe(P6_TRIP_CART_KEY);
    expect(backToCluster.direct).toBe("tom-2kg");
    expect(backToCluster.trip).toBe("thit+rau");
  });

  it("surfaces only minimart and convenience, never supermarket", () => {
    expect([...CONVENIENCE_SURFACE_TYPES]).toEqual(["MINIMART", "CONVENIENCE_STORE"]);
    expect(onConvenienceSurface("MINIMART")).toBe(true);
    expect(onConvenienceSurface("CONVENIENCE_STORE")).toBe(true);
    expect(onConvenienceSurface("SUPERMARKET")).toBe(false);
    expect(onConvenienceSurface("RETAIL_STORE")).toBe(false);
    expect(onConvenienceSurface("SPECIALTY_STORE")).toBe(false);
  });

  it("admits Hôm nay có only for a specialty store or a stall inside a cluster", () => {
    expect(freshTodayEligible({ providerType: "SPECIALTY_STORE", marketClusterId: null })).toBe(true);
    expect(freshTodayEligible({ providerType: "SPECIALTY_STORE", marketClusterId: "ct12" })).toBe(true);
    expect(freshTodayEligible({ providerType: "MARKET_VENDOR", marketClusterId: "ct12" })).toBe(true);
    expect(freshTodayEligible({ providerType: "MARKET_VENDOR", marketClusterId: null })).toBe(false);
    expect(freshTodayEligible({ providerType: "MINIMART", marketClusterId: "ct12" })).toBe(false);
    expect(freshTodayEligible({ providerType: "CONVENIENCE_STORE", marketClusterId: null })).toBe(false);
    expect(freshTodayEligible({ providerType: "SUPERMARKET", marketClusterId: null })).toBe(false);
    expect(freshTodayEligible({ providerType: "RETAIL_STORE", marketClusterId: null })).toBe(false);
  });

  it("rejects a Kim Văn stall checked out on another zone", () => {
    const kimVan = "zone-kim-van";
    const other = "zone-other";
    const cluster = "cho-ct12";
    expect(
      marketZoneMismatch({
        clusterId: cluster,
        clusterZoneId: kimVan,
        basketZoneId: other,
        stalls: [{ marketClusterId: cluster, servingZoneIds: [kimVan] }],
      }),
    ).toBe("BASKET_ZONE");
    expect(
      marketZoneMismatch({
        clusterId: cluster,
        clusterZoneId: kimVan,
        basketZoneId: kimVan,
        stalls: [{ marketClusterId: cluster, servingZoneIds: [other] }],
      }),
    ).toBe("STALL_ZONE");
    expect(
      marketZoneMismatch({
        clusterId: cluster,
        clusterZoneId: kimVan,
        basketZoneId: kimVan,
        stalls: [{ marketClusterId: "other-cluster", servingZoneIds: [kimVan] }],
      }),
    ).toBe("STALL_CLUSTER");
    expect(
      marketZoneMismatch({
        clusterId: cluster,
        clusterZoneId: kimVan,
        basketZoneId: kimVan,
        stalls: [{ marketClusterId: cluster, servingZoneIds: [kimVan, other] }],
      }),
    ).toBeNull();
  });
});
