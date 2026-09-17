import {
  canLaundryCustomerCancelBeforeCollection,
  laundryTransitionsForMode,
  type LaundryPickupMode,
  type ServiceVertical,
} from "./laundry-transitions.js";

/** Family Dinner / Late Dinner: nấu trước, tìm runner (hoặc tự giao) khi READY. */
export function isCookFirstFoodOrder(order: {
  serviceVertical?: string | null;
  orderKind?: string | null;
}): boolean {
  if (order.serviceVertical === "LAUNDRY") return false;
  return order.orderKind === "FAMILY_DINNER" || order.orderKind === "LATE_DINNER";
}

/** Server-controlled transitions for Food orders (COD + online pay paths). */
export const FOOD_ORDER_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["PAYMENT_PENDING", "PROVIDER_ACCEPTED", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "CUSTOMER_CANCELLED"],
  PAID: ["PROVIDER_ACCEPTED", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  /** Quán nhận → runner claim (STANDARD) hoặc bắt đầu nấu (Family Dinner) */
  PROVIDER_ACCEPTED: ["RUNNER_ASSIGNED", "PREPARING", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  /** Runner đã nhận → quán mới được nấu (STANDARD) */
  RUNNER_ASSIGNED: ["PREPARING", "CUSTOMER_CANCELLED"],
  PREPARING: ["READY", "CUSTOMER_CANCELLED"],
  /** Runner pickup, hoặc bếp tự giao (DELIVERING không runner) */
  READY: ["PICKED_UP", "DELIVERING", "CUSTOMER_CANCELLED"],
  PICKED_UP: ["DELIVERING"],
  DELIVERING: ["DELIVERED"],
  PAYMENT_FAILED: [],
  PROVIDER_REJECTED: [],
  CUSTOMER_CANCELLED: [],
  SYSTEM_CANCELLED: [],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
  DELIVERED: [],
};

/** @deprecated use FOOD_ORDER_TRANSITIONS */
export const ORDER_TRANSITIONS = FOOD_ORDER_TRANSITIONS;

export function orderTransitionsForVertical(
  vertical: ServiceVertical = "FOOD",
  laundryPickupMode?: LaundryPickupMode | null,
) {
  if (vertical === "LAUNDRY") {
    return laundryTransitionsForMode(laundryPickupMode);
  }
  return FOOD_ORDER_TRANSITIONS;
}

export function canTransition(
  from: string,
  to: string,
  vertical: ServiceVertical = "FOOD",
  laundryPickupMode?: LaundryPickupMode | null,
): boolean {
  const allowed = orderTransitionsForVertical(vertical, laundryPickupMode)[from];
  return allowed?.includes(to) ?? false;
}

export function canCustomerCancel(
  from: string,
  vertical: ServiceVertical = "FOOD",
  laundryPickupMode?: LaundryPickupMode | null,
): boolean {
  if (vertical === "LAUNDRY") {
    return canLaundryCustomerCancelBeforeCollection(from, laundryPickupMode);
  }
  return canTransition(from, "CUSTOMER_CANCELLED", vertical, laundryPickupMode);
}

const TERMINAL_ORDER_STATUSES = [
  "DELIVERED",
  "COMPLETED",
  "CUSTOMER_CANCELLED",
  "SYSTEM_CANCELLED",
  "REFUNDED",
  "PROVIDER_REJECTED",
  "PAYMENT_FAILED",
] as const;

/** Ops cancel — SYSTEM_CANCELLED from any non-terminal state (§135). */
export function canAdminSystemCancel(from: string): boolean {
  return !TERMINAL_ORDER_STATUSES.includes(from as (typeof TERMINAL_ORDER_STATUSES)[number]);
}

export type ProviderAction =
  | "accept"
  | "reject"
  | "find_runner"
  | "preparing"
  | "ready"
  | "handoff"
  | "received"
  | "collected"
  | "processing"
  | "ready_for_return"
  | "find_return_runner"
  | "cancel_return_runner"
  | "staff_deliver"
  | "complete";

export function providerActionToStatus(action: ProviderAction): string | null {
  switch (action) {
    case "accept":
      return "PROVIDER_ACCEPTED";
    case "reject":
      return "PROVIDER_REJECTED";
    case "find_runner":
    case "find_return_runner":
    case "cancel_return_runner":
    case "handoff":
      return null;
    case "preparing":
      return "PREPARING";
    case "ready":
      return "READY";
    case "received":
    case "collected":
      return "AT_SHOP";
    case "staff_deliver":
      return "RETURN_DELIVERING";
    case "complete":
      return "COMPLETED";
    case "processing":
      return "PROCESSING";
    case "ready_for_return":
      return "READY_FOR_RETURN";
  }
}

export type RunnerAction = "accept" | "picked_up" | "delivering" | "delivered";

export function runnerActionToStatus(action: RunnerAction): string {
  switch (action) {
    case "accept":
      return "RUNNER_ASSIGNED";
    case "picked_up":
      return "PICKED_UP";
    case "delivering":
      return "DELIVERING";
    case "delivered":
      return "DELIVERED";
  }
}
