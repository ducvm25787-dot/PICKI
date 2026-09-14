import { describe, expect, it } from "vitest";
import { planLaundryInboundStops } from "./plan-laundry-inbound.js";
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

describe("planLaundryInboundStops", () => {
  it("plans customer pickup then shop dropoff", () => {
    const stops = planLaundryInboundStops([base]);
    expect(stops.map((s) => s.stopType)).toEqual(["CUSTOMER_PICKUP", "PROVIDER_DROPOFF"]);
    expect(stops[0]?.label).toContain("Lấy đồ");
    expect(stops[1]?.label).toContain("Giao tiệm");
  });
});
