import { describe, expect, it } from "vitest";
import { calculateCustomerDeliveryFeeVnd } from "./delivery-fee.js";
import type { DeliveryPromotionRule } from "./delivery-promotion.js";
import { fundDeliveryQuote, priceBatchRoute, quoteDelivery, type PlaceTripPricing, type ZoneTripPricing } from "./trip-pricing.js";

function zone(partial: Partial<ZoneTripPricing> = {}): ZoneTripPricing {
  return {
    zoneId: "kim-van",
    sameBuildingBaseFee: 5_000,
    buildingToBuildingBaseFee: 10_000,
    groundToBuildingBaseFee: 15_000,
    buildingToGroundBaseFee: 12_000,
    groundToGroundBaseFee: 11_000,
    minimumRunnerPayable: 0,
    hotFoodSurcharge: 3_000,
    heavySurcharge: 5_000,
    bulkySurcharge: 8_000,
    batchExtraOrderFee: 2_000,
    ...partial,
  };
}

function place(partial: Partial<PlaceTripPricing> & Pick<PlaceTripPricing, "id" | "kind" | "code">): PlaceTripPricing {
  return {
    zoneId: "kim-van",
    anchorCode: null,
    doorSurcharge: 0,
    slowElevatorSurcharge: 0,
    lobbyWaitMinutes: 0,
    elevatorWaitMinutes: 0,
    doorWaitMinutes: 0,
    runnerFeePerMinuteVnd: 0,
    ...partial,
  };
}

const ct12a = place({ id: "ct12a", kind: "BUILDING", code: "CT12A" });
const ct12b = place({ id: "ct12b", kind: "BUILDING", code: "CT12B" });
const podium = place({ id: "podium", kind: "RESIDENTIAL_PODIUM_CLUSTER", code: "CT12A-KIOSK", anchorCode: "CT12A" });
const market = place({ id: "cho", kind: "TRADITIONAL_MARKET", code: "CHO-DAI-TU" });
const street = place({ id: "street", kind: "GROUND_STREET_CLUSTER", code: "DAI-TU" });

describe("trip delivery pricing", () => {
  it("prices same building, elevator, other classes, and a different zone", () => {
    const same = quoteDelivery({ zone: zone(), origin: podium, destination: ct12a });
    expect(same?.tripClass).toBe("SAME_BUILDING");
    expect(same?.runnerPayable).toBe(5_000);

    const slow = quoteDelivery({
      zone: zone(),
      origin: podium,
      destination: { ...ct12a, slowElevatorSurcharge: 3_000 },
    });
    expect(slow?.runnerPayable).toBe(8_000);
    expect(quoteDelivery({ zone: zone(), origin: podium, destination: ct12b })?.tripClass).toBe("BUILDING_TO_BUILDING");

    expect(quoteDelivery({ zone: zone(), origin: ct12a, destination: ct12b })?.tripClass).toBe("BUILDING_TO_BUILDING");
    expect(quoteDelivery({ zone: zone(), origin: ct12a, destination: ct12b })?.tripBase).toBe(10_000);
    expect(quoteDelivery({ zone: zone(), origin: market, destination: ct12a })?.tripBase).toBe(15_000);
    expect(quoteDelivery({ zone: zone(), origin: ct12a, destination: street })?.tripBase).toBe(12_000);
    expect(quoteDelivery({ zone: zone(), origin: market, destination: street })?.tripBase).toBe(11_000);

    const other = zone({ zoneId: "linh-dam", sameBuildingBaseFee: 7_000 });
    expect(quoteDelivery({ zone: other, origin: { ...podium, zoneId: "linh-dam" }, destination: { ...ct12a, zoneId: "linh-dam" } })?.tripBase).toBe(7_000);
    expect(quoteDelivery({ zone: other, origin: podium, destination: ct12a })).toBeNull();
  });

  it("keeps a building override off the next building and counts each handling flag once", () => {
    const quoted = quoteDelivery({
      zone: zone(),
      origin: ct12a,
      destination: { ...ct12b, slowElevatorSurcharge: 3_000, doorSurcharge: 1_000 },
      handlingFlags: ["HOT_FOOD", "HOT_FOOD", "HEAVY", "BULKY"],
    });
    expect(quoted?.buildingSurcharge).toBe(4_000);
    expect(quoted?.handlingSurcharge).toBe(3_000 + 5_000 + 8_000);
    expect(quoteDelivery({ zone: zone(), origin: ct12b, destination: ct12a })?.buildingSurcharge).toBe(0);
  });

  it("funds the runner payable with the existing customer, provider, and Pickee split", () => {
    const quote = quoteDelivery({
      zone: zone(),
      origin: podium,
      destination: { ...ct12a, slowElevatorSurcharge: 3_000 },
    });
    const provider: DeliveryPromotionRule = {
      id: "shop",
      sponsorType: "PROVIDER",
      subsidyMode: "COVER_UP_TO",
      maxSubsidyPerOrderVnd: 8_000,
      providerShareVnd: 0,
      pickeeShareVnd: 0,
      minimumOrderVnd: 0,
      eligibleModes: ["PICKEE_RUNNER"],
    };
    const covered = fundDeliveryQuote(quote!, { subtotalVnd: 50_000, promotion: provider });
    expect(covered.runnerPayable).toBe(8_000);
    expect(covered.customerDeliveryFee).toBe(0);
    expect(covered.providerDeliverySubsidy).toBe(8_000);

    const shared: DeliveryPromotionRule = {
      ...provider,
      id: "shared",
      sponsorType: "SHARED",
      subsidyMode: "SHARED_AMOUNTS",
      maxSubsidyPerOrderVnd: 8_000,
      providerShareVnd: 5_000,
      pickeeShareVnd: 3_000,
    };
    const split = fundDeliveryQuote(
      quoteDelivery({ zone: zone({ sameBuildingBaseFee: 20_000 }), origin: podium, destination: ct12a })!,
      { subtotalVnd: 50_000, promotion: shared },
    );
    expect(split.runnerPayable).toBe(20_000);
    expect(split.customerDeliveryFee).toBe(12_000);
    expect(split.providerDeliverySubsidy).toBe(5_000);
    expect(split.pickeeDeliverySubsidy).toBe(3_000);
  });

  it("freezes an order snapshot when the zone price changes", () => {
    const quote = quoteDelivery({ zone: zone(), origin: podium, destination: ct12a });
    const snapshot = { ...quote!.pricingRuleSnapshot };
    const later = quoteDelivery({ zone: zone({ sameBuildingBaseFee: 9_000 }), origin: podium, destination: ct12a });
    expect(later?.tripBase).toBe(9_000);
    expect(snapshot.tripBase).toBe(5_000);
    expect(snapshot.runnerPayable).toBe(5_000);
  });

  it("prices a batch below the sum of standalone payouts and balances the allocations", () => {
    const order = {
      tripBase: 5_000,
      buildingKey: "CT12A",
      buildingSurcharge: 0,
      handlingSurcharge: 0,
      runnerPayable: 5_000,
    };
    const batch = priceBatchRoute({
      extraOrderFee: 2_000,
      orders: [
        { ...order, orderId: "a" },
        { ...order, orderId: "b" },
        { ...order, orderId: "c" },
      ],
    });
    const standalone = 15_000;
    expect(batch.routeRunnerPayable).toBeLessThan(standalone);
    expect(batch.allocations.reduce((sum, row) => sum + row.amount, 0)).toBe(batch.routeRunnerPayable);
  });

  it("leaves an unclassified trip on the existing customer fee", () => {
    expect(quoteDelivery({ zone: zone(), origin: null, destination: ct12a })).toBeNull();
    expect(
      calculateCustomerDeliveryFeeVnd({
        serviceVertical: "FOOD",
        handoffMode: "LOBBY_PICKUP",
        zoneSettings: { foodDeliveryFeeVnd: 15_000, foodDoorDeliveryFeeVnd: 20_000 },
      }),
    ).toBe(15_000);
  });
});
