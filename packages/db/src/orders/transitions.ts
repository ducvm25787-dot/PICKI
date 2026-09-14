/** Server-controlled transitions for Food orders (COD + online pay paths). */
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["PAYMENT_PENDING", "PROVIDER_ACCEPTED", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  PAYMENT_PENDING: ["PAID", "PAYMENT_FAILED", "CUSTOMER_CANCELLED"],
  PAID: ["PROVIDER_ACCEPTED", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  /** Quán nhận → chờ runner claim (Grab-like) */
  PROVIDER_ACCEPTED: ["RUNNER_ASSIGNED", "PROVIDER_REJECTED", "CUSTOMER_CANCELLED"],
  /** Runner đã nhận → quán mới được nấu */
  RUNNER_ASSIGNED: ["PREPARING", "CUSTOMER_CANCELLED"],
  PREPARING: ["READY", "CUSTOMER_CANCELLED"],
  READY: ["PICKED_UP", "CUSTOMER_CANCELLED"],
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

export function canTransition(from: string, to: string): boolean {
  const allowed = ORDER_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

const TERMINAL_ORDER_STATUSES = [
  "DELIVERED",
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

export type ProviderAction = "accept" | "reject" | "preparing" | "ready" | "handoff";

export function providerActionToStatus(action: ProviderAction): string | null {
  switch (action) {
    case "accept":
      return "PROVIDER_ACCEPTED";
    case "reject":
      return "PROVIDER_REJECTED";
    case "preparing":
      return "PREPARING";
    case "ready":
      return "READY";
    case "handoff":
      return null;
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
