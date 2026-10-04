import { describe, expect, it } from "vitest";
import {
  rankMarketHero,
  suggestDiscoverySurface,
  surfacesForCommerce,
} from "./discovery-surface";

const SNAIL = "a1000001-0000-4000-8000-000000000101";
const MAIN = "a1000001-0000-4000-8000-000000000001";

describe("discovery surface suggestion", () => {
  it("keeps food and market rails apart", () => {
    expect(suggestDiscoverySurface({ commerceModel: "FOOD_SERVICE", categoryId: MAIN })).toBe(
      "SPECIAL_TODAY",
    );
    expect(suggestDiscoverySurface({ commerceModel: "FOOD_SERVICE", categoryId: SNAIL })).toBe(
      "SNACK_DESSERT",
    );
    expect(suggestDiscoverySurface({ commerceModel: "FRESH_MARKET", categoryId: SNAIL })).toBe(
      "MARKET_TODAY",
    );
    expect(suggestDiscoverySurface({ commerceModel: "RETAIL_STORE", categoryId: null })).toBe(
      "MARKET_TODAY",
    );
    expect(surfacesForCommerce("FOOD_SERVICE")).toEqual(["SPECIAL_TODAY", "SNACK_DESSERT"]);
    expect(surfacesForCommerce("RETAIL_STORE")).toEqual(["MARKET_TODAY"]);
  });

  it("prefers another seller class without a fixed rotation", () => {
    const rows = [
      { id: "s1", providerId: "super", providerClass: "Siêu thị" },
      { id: "s2", providerId: "super", providerClass: "Siêu thị" },
      { id: "s3", providerId: "super", providerClass: "Siêu thị" },
      { id: "s4", providerId: "super", providerClass: "Siêu thị" },
      { id: "v1", providerId: "vendor", providerClass: "Tiểu thương" },
    ];
    expect(rankMarketHero(rows, 4).map((row) => row.id)).toEqual(["s1", "s2", "v1", "s3"]);
  });

  it("stops one provider at the daily hero quota", () => {
    const rows = [1, 2, 3, 4].map((n) => ({
      id: `s${n}`,
      providerId: "super",
      providerClass: "Siêu thị",
    }));
    expect(rankMarketHero(rows, 8)).toHaveLength(3);
  });
});
