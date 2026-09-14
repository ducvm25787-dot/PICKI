import { describe, expect, it } from "vitest";
import { canBatchOrder, planRouteStops } from "./plan-route.js";

const base = {
  providerLocationId: "loc-a",
  providerName: "Cơm Tấm A",
  providerLat: 21.01,
  providerLng: 105.81,
  deliveryLat: 21.0,
  deliveryLng: 105.8,
  deliveryFloor: null,
};

describe("planRouteStops", () => {
  it("plans pickup → lobby → apartment for high-rise", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryBuilding: "CT12A",
        deliveryFloor: "18",
        deliveryApartment: "1802",
      },
    ]);

    expect(stops.map((s) => s.stopType)).toEqual([
      "PICKUP",
      "LOBBY_DROPOFF",
      "APARTMENT_DROPOFF",
    ]);
    expect(stops[2]?.label).toContain("1802");
  });

  it("dedupes pickup for same provider location", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryBuilding: "CT12A",
        deliveryApartment: "1802",
      },
      {
        ...base,
        orderId: "o2",
        orderNumber: "PK-002",
        deliveryBuilding: "CT12A",
        deliveryApartment: "1901",
      },
    ]);

    expect(stops.filter((s) => s.stopType === "PICKUP")).toHaveLength(1);
    expect(stops.filter((s) => s.stopType === "LOBBY_DROPOFF")).toHaveLength(1);
    expect(stops.filter((s) => s.stopType === "APARTMENT_DROPOFF")).toHaveLength(2);
  });
});

describe("canBatchOrder", () => {
  it("allows same-building batch under limit", () => {
    expect(
      canBatchOrder(
        [
          {
            ...base,
            orderId: "o1",
            orderNumber: "PK-001",
            deliveryBuilding: "CT12A",
            deliveryApartment: "1802",
          },
        ],
        {
          ...base,
          orderId: "o2",
          orderNumber: "PK-002",
          deliveryBuilding: "CT12A",
          deliveryApartment: "1901",
        },
      ),
    ).toBe(true);
  });

  it("rejects different buildings", () => {
    expect(
      canBatchOrder(
        [
          {
            ...base,
            orderId: "o1",
            orderNumber: "PK-001",
            deliveryBuilding: "CT12A",
            deliveryApartment: "1802",
          },
        ],
        {
          ...base,
          orderId: "o2",
          orderNumber: "PK-002",
          deliveryBuilding: "CT12B",
          deliveryApartment: "1901",
        },
      ),
    ).toBe(false);
  });
});
