import { isCookFirstFoodOrder } from "./transitions.js";

/**
 * Pilot food STANDARD seeks a runner when the shop has accepted and nobody is looking yet.
 * Scheduled morning market must not enter that path: the shop finds a runner itself,
 * and only inside the prepare window.
 */
export function shouldAutoSeekRunner(order: {
  serviceVertical?: string | null;
  orderKind?: string | null;
  status?: string | null;
  runnerUserId?: string | null;
  runnerSoughtAt?: Date | string | null;
  runnerSearchCancelledAt?: Date | string | null;
  scheduledDeliveryWindowId?: string | null;
}): boolean {
  if (order.serviceVertical === "LAUNDRY") return false;
  if (isCookFirstFoodOrder(order)) return false;
  if (order.scheduledDeliveryWindowId) return false;
  if (order.status !== "PROVIDER_ACCEPTED") return false;
  if (order.runnerUserId || order.runnerSoughtAt || order.runnerSearchCancelledAt) return false;
  return true;
}
