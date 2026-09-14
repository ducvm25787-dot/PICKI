import type { RouteOrderInput } from "./plan-route.js";

export type BatchSettings = {
  maxBatchOrders: number;
  batchWaitWindowMinutes: number;
};

export const DEFAULT_BATCH_SETTINGS: BatchSettings = {
  maxBatchOrders: 3,
  batchWaitWindowMinutes: 5,
};

/** Rule-based batch eligibility (§98) — pilot V1 without detour solver. */
export function canBatchOrderWithSettings(
  existing: RouteOrderInput[],
  incoming: RouteOrderInput,
  settings: BatchSettings,
): boolean {
  if (existing.length >= settings.maxBatchOrders) return false;
  if (existing.some((o) => o.orderId === incoming.orderId)) return false;

  const building = incoming.deliveryBuilding?.trim();
  if (!building) return false;

  if (!existing.every((o) => o.deliveryBuilding?.trim() === building)) return false;

  if (settings.batchWaitWindowMinutes > 0 && existing.length > 0) {
    const oldest = existing.reduce((min, o) => {
      const t = o.readyAt?.getTime() ?? 0;
      return t < min ? t : min;
    }, Infinity);
    const incomingReady = incoming.readyAt?.getTime() ?? Date.now();
    const windowMs = settings.batchWaitWindowMinutes * 60 * 1000;
    if (incomingReady - oldest > windowMs) return false;
  }

  return true;
}
