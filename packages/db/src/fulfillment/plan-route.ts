export type RouteOrderInput = {
  orderId: string;
  orderNumber: string;
  providerLocationId: string;
  providerName: string;
  providerLat: number | null;
  providerLng: number | null;
  deliveryBuilding: string | null;
  deliveryFloor: string | null;
  deliveryApartment: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  readyAt?: Date | null;
};

export type PlannedStop = {
  stopType: "PICKUP" | "LOBBY_DROPOFF" | "APARTMENT_DROPOFF" | "PICKI_POINT";
  orderId: string | null;
  providerLocationId: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  lat: number | null;
  lng: number | null;
  label: string;
};

/** Rule-based stop sequence: pickups → lobby batch by building → apartment doors. */
export function planRouteStops(orders: RouteOrderInput[]): PlannedStop[] {
  if (orders.length === 0) return [];

  const stops: PlannedStop[] = [];
  const seenPickups = new Set<string>();

  for (const order of orders) {
    const pickupKey = order.providerLocationId;
    if (!seenPickups.has(pickupKey)) {
      seenPickups.add(pickupKey);
      stops.push({
        stopType: "PICKUP",
        orderId: null,
        providerLocationId: order.providerLocationId,
        building: null,
        floor: null,
        apartment: null,
        lat: order.providerLat,
        lng: order.providerLng,
        label: `Lấy hàng · ${order.providerName}`,
      });
    }
  }

  const lobbyByBuilding = new Map<string, RouteOrderInput[]>();
  for (const order of orders) {
    const building = order.deliveryBuilding?.trim();
    if (!building) continue;
    const group = lobbyByBuilding.get(building) ?? [];
    group.push(order);
    lobbyByBuilding.set(building, group);
  }

  for (const [building, group] of lobbyByBuilding) {
    const numbers = group.map((o) => o.orderNumber).join(", ");
    stops.push({
      stopType: "LOBBY_DROPOFF",
      orderId: group.length === 1 ? group[0]!.orderId : null,
      providerLocationId: null,
      building,
      floor: null,
      apartment: null,
      lat: group[0]?.deliveryLat ?? null,
      lng: group[0]?.deliveryLng ?? null,
      label:
        group.length === 1
          ? `Sảnh ${building}`
          : `Sảnh ${building} · ${String(group.length)} đơn (${numbers})`,
    });
  }

  for (const order of orders) {
    const building = order.deliveryBuilding?.trim();
    const apartment = order.deliveryApartment?.trim();
    if (building && apartment) {
      stops.push({
        stopType: "APARTMENT_DROPOFF",
        orderId: order.orderId,
        providerLocationId: null,
        building,
        floor: order.deliveryFloor,
        apartment,
        lat: order.deliveryLat,
        lng: order.deliveryLng,
        label: `Cửa ${building}-${apartment} · ${order.orderNumber}`,
      });
    } else if (!building) {
      stops.push({
        stopType: "APARTMENT_DROPOFF",
        orderId: order.orderId,
        providerLocationId: null,
        building: null,
        floor: order.deliveryFloor,
        apartment: order.deliveryApartment,
        lat: order.deliveryLat,
        lng: order.deliveryLng,
        label: `Giao tận nơi · ${order.orderNumber}`,
      });
    }
  }

  return stops;
}

export const MAX_BATCH_ORDERS = 3;

export function canBatchOrder(
  existingOrders: RouteOrderInput[],
  incoming: RouteOrderInput,
): boolean {
  if (existingOrders.length >= MAX_BATCH_ORDERS) return false;
  if (existingOrders.some((o) => o.orderId === incoming.orderId)) return false;

  const building = incoming.deliveryBuilding?.trim();
  if (!building) return false;

  return existingOrders.every((o) => o.deliveryBuilding?.trim() === building);
}
