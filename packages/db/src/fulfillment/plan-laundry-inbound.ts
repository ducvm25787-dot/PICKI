import type { PlannedStop, RouteOrderInput } from "./plan-route.js";

function customerLabel(order: RouteOrderInput): string {
  if (order.deliveryAddressType === "STREET_ADDRESS" || order.deliveryStreet?.trim()) {
    const parts = [
      order.deliveryHouseNumber,
      order.deliveryAlley ? `ngõ ${order.deliveryAlley}` : null,
      order.deliveryStreet,
    ].filter(Boolean);
    return parts.join(" ") || "Nhà khách";
  }
  if (order.deliveryBuilding && order.deliveryApartment) {
    const floor = order.deliveryFloor ? `, tầng ${order.deliveryFloor}` : "";
    return `${order.deliveryBuilding}-${order.deliveryApartment}${floor}`;
  }
  return order.deliveryBuilding ?? "Nhà khách";
}

/** Inbound laundry leg: runner picks up at customer → drops at shop. */
export function planLaundryInboundStops(orders: RouteOrderInput[]): PlannedStop[] {
  if (orders.length === 0) return [];

  const stops: PlannedStop[] = [];

  for (const order of orders) {
    stops.push({
      stopType: "CUSTOMER_PICKUP",
      orderId: order.orderId,
      providerLocationId: null,
      building: order.deliveryBuilding,
      floor: order.deliveryFloor,
      apartment: order.deliveryApartment,
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      label: `Lấy đồ · ${customerLabel(order)} · ${order.orderNumber}`,
    });
  }

  const seenShops = new Set<string>();
  for (const order of orders) {
    if (seenShops.has(order.providerLocationId)) continue;
    seenShops.add(order.providerLocationId);
    stops.push({
      stopType: "PROVIDER_DROPOFF",
      orderId: null,
      providerLocationId: order.providerLocationId,
      building: null,
      floor: null,
      apartment: null,
      lat: order.providerLat,
      lng: order.providerLng,
      label: `Giao tiệm · ${order.providerName}`,
    });
  }

  return stops;
}
