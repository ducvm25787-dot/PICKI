import { describe, expect, it } from "vitest";
import { FRESH_CATEGORY, groupForCategory, CLUSTER_STALL_GROUPS, STORE_GROUPS } from "./market-groups.js";

describe("fresh market groups", () => {
  it("puts a stall in one cluster group", () => {
    expect(groupForCategory(CLUSTER_STALL_GROUPS, FRESH_CATEGORY.meat).label).toBe("Thịt");
    expect(groupForCategory(CLUSTER_STALL_GROUPS, FRESH_CATEGORY.eggs).label).toBe("Gia cầm");
    expect(groupForCategory(CLUSTER_STALL_GROUPS, null).label).toBe("Khác");
  });

  it("keeps seafood specialty stores on the store shelf", () => {
    expect(groupForCategory(STORE_GROUPS, FRESH_CATEGORY.seafood).label).toBe("Hải sản");
    expect(groupForCategory(STORE_GROUPS, FRESH_CATEGORY.country).label).toBe("Đồ quê / đặc sản");
  });
});
