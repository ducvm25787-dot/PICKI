import { describe, expect, it } from "vitest";
import { canBatchOrderWithSettings, DEFAULT_BATCH_SETTINGS } from "./batching.js";
import type { RouteOrderInput } from "./plan-route.js";

const base = (): RouteOrderInput => ({
  orderId: "o1",
  orderNumber: "PK-1",
  providerLocationId: "loc",
  providerName: "Quán",
  providerLat: null,
  providerLng: null,
  deliveryBuilding: "CT12A",
  deliveryFloor: null,
  deliveryApartment: "1802",
  deliveryLat: null,
  deliveryLng: null,
  readyAt: new Date("2026-09-14T10:00:00Z"),
});

describe("canBatchOrderWithSettings", () => {
  it("respects max batch orders from zone settings", () => {
    const existing = [base(), { ...base(), orderId: "o2", orderNumber: "PK-2" }];
    const incoming = { ...base(), orderId: "o3", orderNumber: "PK-3" };
    expect(canBatchOrderWithSettings(existing, incoming, DEFAULT_BATCH_SETTINGS)).toBe(true);
    expect(
      canBatchOrderWithSettings(existing, incoming, { ...DEFAULT_BATCH_SETTINGS, maxBatchOrders: 2 }),
    ).toBe(false);
  });
});
