import { describe, expect, it } from "vitest";
import { planLaundryReturnStops } from "./plan-laundry-return.js";
import type { RouteOrderInput } from "./plan-route.js";

const base: RouteOrderInput = {
  orderId: "o1",
  orderNumber: "KVL-001",
  serviceVertical: "LAUNDRY",
  providerLocationId: "loc1",
  providerName: "Giặt Kim Văn",
  providerLat: 20.98,
  providerLng: 105.84,
  deliveryBuilding: "CT12A",
  deliveryFloor: "12",
  deliveryApartment: "1205",
  deliveryLat: null,
  deliveryLng: null,
};

describe("planLaundryReturnStops", () => {
  it("plans shop pickup then customer dropoff", () => {
    const stops = planLaundryReturnStops([base]);
    expect(stops.map((s) => s.stopType)).toEqual(["RETURN_PICKUP", "RETURN_DROPOFF"]);
  });
});
