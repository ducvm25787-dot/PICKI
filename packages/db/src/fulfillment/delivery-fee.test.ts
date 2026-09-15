import { describe, expect, it } from "vitest";
import {
  calculateCustomerDeliveryFeeVnd,
  calculateProviderRunnerFeeVnd,
  DEFAULT_FOOD_DELIVERY_FEE_VND,
  DEFAULT_FOOD_DOOR_DELIVERY_FEE_VND,
  DEFAULT_LAUNDRY_RETURN_RUNNER_FEE_VND,
} from "./delivery-fee.js";

describe("calculateCustomerDeliveryFeeVnd", () => {
  it("returns 0 for laundry", () => {
    expect(
      calculateCustomerDeliveryFeeVnd({
        serviceVertical: "LAUNDRY",
        handoffMode: "DOOR_DELIVERY",
      }),
    ).toBe(0);
  });

  it("uses lobby fee for LOBBY_PICKUP", () => {
    expect(
      calculateCustomerDeliveryFeeVnd({
        serviceVertical: "FOOD",
        handoffMode: "LOBBY_PICKUP",
        zoneSettings: { foodDeliveryFeeVnd: 12_000, foodDoorDeliveryFeeVnd: 18_000 },
      }),
    ).toBe(12_000);
  });

  it("uses door fee for DOOR_DELIVERY", () => {
    expect(
      calculateCustomerDeliveryFeeVnd({
        serviceVertical: "FOOD",
        handoffMode: "DOOR_DELIVERY",
      }),
    ).toBe(DEFAULT_FOOD_DOOR_DELIVERY_FEE_VND);
  });

  it("defaults when zone settings missing", () => {
    expect(
      calculateCustomerDeliveryFeeVnd({
        serviceVertical: "FOOD",
        handoffMode: "LOBBY_PICKUP",
      }),
    ).toBe(DEFAULT_FOOD_DELIVERY_FEE_VND);
  });
});

describe("calculateProviderRunnerFeeVnd", () => {
  it("food uses order snapshot", () => {
    expect(
      calculateProviderRunnerFeeVnd({
        serviceVertical: "FOOD",
        orderDeliveryFeeVnd: 20_000,
      }),
    ).toBe(20_000);
  });

  it("laundry return uses zone rate", () => {
    expect(
      calculateProviderRunnerFeeVnd({
        serviceVertical: "LAUNDRY",
        leg: "RETURN",
        zoneSettings: { foodDeliveryFeeVnd: 15_000, foodDoorDeliveryFeeVnd: 20_000, laundryReturnRunnerFeeVnd: 18_000 },
      }),
    ).toBe(18_000);
  });

  it("laundry return defaults", () => {
    expect(
      calculateProviderRunnerFeeVnd({
        serviceVertical: "LAUNDRY",
        leg: "RETURN",
      }),
    ).toBe(DEFAULT_LAUNDRY_RETURN_RUNNER_FEE_VND);
  });
});
