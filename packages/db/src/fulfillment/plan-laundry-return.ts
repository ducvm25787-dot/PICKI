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

/** Return leg: runner picks up at shop → delivers to customer. */
export function planLaundryReturnStops(orders: RouteOrderInput[]): PlannedStop[] {
  if (orders.length === 0) return [];

  const stops: PlannedStop[] = [];
  const seenShops = new Set<string>();

  for (const order of orders) {
    if (!seenShops.has(order.providerLocationId)) {
      seenShops.add(order.providerLocationId);
      stops.push({
        stopType: "RETURN_PICKUP",
        orderId: null,
        providerLocationId: order.providerLocationId,
        building: null,
        floor: null,
        apartment: null,
        lat: order.providerLat,
        lng: order.providerLng,
        label: `Lấy đồ tại tiệm · ${order.providerName}`,
      });
    }
  }

  for (const order of orders) {
    stops.push({
      stopType: "RETURN_DROPOFF",
      orderId: order.orderId,
      providerLocationId: null,
      building: order.deliveryBuilding,
      floor: order.deliveryFloor,
      apartment: order.deliveryApartment,
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      label: `Giao đồ · ${customerLabel(order)} · ${order.orderNumber}`,
    });
  }

  return stops;
}
