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
  it("plans pickup → lobby for lobby pickup mode", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryHandoffMode: "LOBBY_PICKUP",
        deliveryBuilding: "CT12A",
        deliveryFloor: "18",
        deliveryApartment: "1802",
      },
    ]);

    expect(stops.map((s) => s.stopType)).toEqual(["PICKUP", "LOBBY_DROPOFF"]);
  });

  it("plans pickup → door for street address", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryHandoffMode: "DOOR_DELIVERY",
        deliveryAddressType: "STREET_ADDRESS",
        deliveryHouseNumber: "12",
        deliveryAlley: "3",
        deliveryStreet: "Kim Giang",
        deliveryWard: "Đại Kim",
      },
    ]);

    expect(stops.map((s) => s.stopType)).toEqual(["PICKUP", "APARTMENT_DROPOFF"]);
    expect(stops[1]?.label).toContain("Kim Giang");
  });

  it("plans pickup → apartment for door delivery mode", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryHandoffMode: "DOOR_DELIVERY",
        deliveryBuilding: "CT12A",
        deliveryFloor: "18",
        deliveryApartment: "1802",
      },
    ]);

    expect(stops.map((s) => s.stopType)).toEqual(["PICKUP", "APARTMENT_DROPOFF"]);
    expect(stops[1]?.label).toContain("1802");
  });

  it("dedupes pickup for same provider location", () => {
    const stops = planRouteStops([
      {
        ...base,
        orderId: "o1",
        orderNumber: "PK-001",
        deliveryHandoffMode: "LOBBY_PICKUP",
        deliveryBuilding: "CT12A",
        deliveryApartment: "1802",
      },
      {
        ...base,
        orderId: "o2",
        orderNumber: "PK-002",
        deliveryHandoffMode: "DOOR_DELIVERY",
        deliveryBuilding: "CT12A",
        deliveryApartment: "1901",
      },
    ]);

    expect(stops.filter((s) => s.stopType === "PICKUP")).toHaveLength(1);
    expect(stops.filter((s) => s.stopType === "LOBBY_DROPOFF")).toHaveLength(1);
    expect(stops.filter((s) => s.stopType === "APARTMENT_DROPOFF")).toHaveLength(1);
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

  it("allows same-street batch for ground addresses", () => {
    expect(
      canBatchOrder(
        [
          {
            ...base,
            orderId: "o1",
            orderNumber: "PK-001",
            deliveryAddressType: "STREET_ADDRESS",
            deliveryStreet: "Kim Giang",
            deliveryHouseNumber: "12",
            deliveryWard: "Đại Kim",
          },
        ],
        {
          ...base,
          orderId: "o2",
          orderNumber: "PK-002",
          deliveryAddressType: "STREET_ADDRESS",
          deliveryStreet: "Kim Giang",
          deliveryHouseNumber: "14",
          deliveryWard: "Đại Kim",
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
