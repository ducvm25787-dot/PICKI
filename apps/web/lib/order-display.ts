import { orderStatusLabel } from "./orders";

/** Hiển thị ETA thống nhất trên customer / provider / runner */
export function formatEstimatedReady(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const now = Date.now();
  if (at.getTime() <= now) return "Sẵn sàng lấy hàng";
  const mins = Math.max(1, Math.round((at.getTime() - now) / 60_000));
  return `Dự kiến ~${String(mins)} phút (${at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})`;
}

/** Ngày giao dự kiến — giặt là */
export function formatLaundryEstimatedDelivery(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `Giao dự kiến: ${at.toLocaleDateString("vi-VN", { weekday: "short", day: "numeric", month: "numeric" })} · ${at.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Grab-like: Quán nhận → Tìm runner → Runner nhận → Nấu → … */
export const ORDER_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Quán nhận" },
  { key: "SEEKING_RUNNER", label: "Tìm runner" },
  { key: "RUNNER_ASSIGNED", label: "Runner nhận" },
  { key: "PREPARING", label: "Nấu" },
  { key: "READY", label: "Sẵn sàng" },
  { key: "PICKED_UP", label: "Bàn giao" },
  { key: "DELIVERING", label: "Giao" },
  { key: "DELIVERED", label: "Xong" },
] as const;

/** Family Dinner: nấu xong mới tìm runner / tự giao */
export const COOK_FIRST_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Quán nhận" },
  { key: "PREPARING", label: "Nấu" },
  { key: "READY", label: "Sẵn sàng" },
  { key: "SEEKING_RUNNER", label: "Tìm runner" },
  { key: "RUNNER_ASSIGNED", label: "Runner nhận" },
  { key: "PICKED_UP", label: "Bàn giao" },
  { key: "DELIVERING", label: "Giao" },
  { key: "DELIVERED", label: "Xong" },
] as const;

export const LAUNDRY_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Tiệm nhận" },
  { key: "AT_SHOP", label: "Đã lấy đồ" },
  { key: "PROCESSING", label: "Đang giặt" },
  { key: "READY_FOR_RETURN", label: "Sẵn sàng trả" },
  { key: "RETURN_RUNNER_ASSIGNED", label: "Runner giao" },
  { key: "RETURN_DELIVERING", label: "Đang giao về" },
  { key: "COMPLETED", label: "Hoàn tất" },
] as const;

/** Khách giặt là — không hiển thị runner, chỉ tiến độ dịch vụ + giao */
export const LAUNDRY_CUSTOMER_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Tiệm nhận" },
  { key: "AT_SHOP", label: "Đã lấy đồ" },
  { key: "PROCESSING", label: "Đang giặt" },
  { key: "READY_FOR_RETURN", label: "Chuẩn bị giao" },
  { key: "RETURN_DELIVERING", label: "Đang giao về" },
  { key: "COMPLETED", label: "Hoàn tất" },
] as const;

export const LAUNDRY_ON_SITE_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Tiệm nhận" },
  { key: "PROCESSING", label: "Đang xử lý" },
  { key: "COMPLETED", label: "Hoàn tất" },
] as const;

export function isCookFirstOrderKind(orderKind?: string | null): boolean {
  return orderKind === "FAMILY_DINNER" || orderKind === "LATE_DINNER";
}

export function orderStepIndex(
  status: string,
  opts: {
    runnerSoughtAt?: string | null;
    runnerUserId?: string | null;
    hasRunner?: boolean;
    serviceVertical?: string | null;
    laundryPickupMode?: string | null;
    orderKind?: string | null;
    audience?: "customer" | "provider" | "runner";
  } = {},
): number {
  if (opts.serviceVertical === "LAUNDRY") {
    if (opts.laundryPickupMode === "ON_SITE") {
      const onSiteMap: Record<string, number> = {
        CREATED: -1,
        PAID: -1,
        PROVIDER_ACCEPTED: 0,
        PROCESSING: 1,
        COMPLETED: 2,
      };
      return onSiteMap[status] ?? -1;
    }

    if (opts.audience === "customer") {
      if (status === "PROVIDER_ACCEPTED") return 0;
      const customerMap: Record<string, number> = {
        CREATED: -1,
        PAID: -1,
        AT_SHOP: 1,
        PROCESSING: 2,
        READY_FOR_RETURN: 3,
        RETURN_RUNNER_ASSIGNED: 4,
        RETURN_PICKED_UP: 4,
        RETURN_DELIVERING: 4,
        COMPLETED: 5,
      };
      return customerMap[status] ?? -1;
    }

    if (status === "PROVIDER_ACCEPTED") return 0;
    const laundryMap: Record<string, number> = {
      CREATED: -1,
      PAID: -1,
      AT_SHOP: 1,
      PROCESSING: 2,
      READY_FOR_RETURN: 3,
      RETURN_RUNNER_ASSIGNED: 4,
      RETURN_PICKED_UP: 4,
      RETURN_DELIVERING: 5,
      COMPLETED: 6,
      DELIVERED: 1,
    };
    return laundryMap[status] ?? -1;
  }

  if (isCookFirstOrderKind(opts.orderKind)) {
    if (status === "PROVIDER_ACCEPTED") return 0;
    if (status === "PREPARING") return 1;
    if (status === "READY") {
      if (opts.hasRunner || opts.runnerUserId) return 4;
      if (opts.runnerSoughtAt) return 3;
      return 2;
    }
    if (status === "RUNNER_ASSIGNED") return 4;
    const cookFirstMap: Record<string, number> = {
      CREATED: -1,
      PAID: -1,
      PICKED_UP: 5,
      DELIVERING: 6,
      DELIVERED: 7,
    };
    return cookFirstMap[status] ?? -1;
  }

  if (status === "PROVIDER_ACCEPTED") {
    return opts.runnerSoughtAt ? 1 : 0;
  }
  const map: Record<string, number> = {
    CREATED: -1,
    PAID: -1,
    RUNNER_ASSIGNED: 2,
    PREPARING: 3,
    READY: 4,
    PICKED_UP: 5,
    DELIVERING: 6,
    DELIVERED: 7,
  };
  return map[status] ?? -1;
}

export function flowStepsForOrder(opts: {
  serviceVertical?: string | null;
  laundryPickupMode?: string | null;
  orderKind?: string | null;
  audience?: "customer" | "provider" | "runner";
}) {
  if (opts.serviceVertical === "LAUNDRY") {
    if (opts.laundryPickupMode === "ON_SITE") return LAUNDRY_ON_SITE_FLOW_STEPS;
    if (opts.audience === "customer") return LAUNDRY_CUSTOMER_FLOW_STEPS;
    return LAUNDRY_FLOW_STEPS;
  }
  if (isCookFirstOrderKind(opts.orderKind)) return COOK_FIRST_FLOW_STEPS;
  return ORDER_FLOW_STEPS;
}

export function laundryCustomerStatusLabel(status: string): string {
  switch (status) {
    case "PROVIDER_ACCEPTED":
      return "Tiệm đã nhận đơn";
    case "AT_SHOP":
      return "Đồ đã về tiệm";
    case "PROCESSING":
      return "Đang giặt / xử lý";
    case "READY_FOR_RETURN":
      return "Chuẩn bị giao về";
    case "RETURN_RUNNER_ASSIGNED":
    case "RETURN_PICKED_UP":
    case "RETURN_DELIVERING":
      return "Đang giao về";
    case "COMPLETED":
      return "Hoàn tất";
    default:
      return orderStatusLabel(status);
  }
}

/** @deprecated use flowStepsForOrder */
export function orderFlowSteps(serviceVertical?: string | null) {
  return flowStepsForOrder({ serviceVertical });
}

export function orderStatusRich(
  status: string,
  opts: {
    estimatedReadyAt?: string | null;
    providerHandoffAt?: string | null;
    runnerSoughtAt?: string | null;
    runner?: { displayName: string } | null;
    serviceVertical?: string | null;
    laundryPickupMode?: string | null;
  } = {},
): string {
  const base =
    opts.serviceVertical === "LAUNDRY"
      ? laundryCustomerStatusLabel(status)
      : orderStatusLabel(status);
  if (opts.serviceVertical === "LAUNDRY" && opts.estimatedReadyAt) {
    const delivery = formatLaundryEstimatedDelivery(opts.estimatedReadyAt);
    if (
      delivery &&
      ["AT_SHOP", "PROCESSING", "READY_FOR_RETURN", "RETURN_RUNNER_ASSIGNED", "RETURN_PICKED_UP", "RETURN_DELIVERING"].includes(
        status,
      )
    ) {
      return `${base} · ${delivery}`;
    }
  }
  if (opts.serviceVertical !== "LAUNDRY") {
    const eta = formatEstimatedReady(opts.estimatedReadyAt);
    if (eta && (status === "PREPARING" || status === "READY" || status === "RUNNER_ASSIGNED")) {
      return `${base} · ${eta}`;
    }
  }
  if (opts.runnerSoughtAt && status === "PROVIDER_ACCEPTED" && opts.serviceVertical !== "LAUNDRY") {
    return `${base} · Đang tìm runner`;
  }
  if (
    opts.runner &&
    status === "RUNNER_ASSIGNED" &&
    opts.serviceVertical !== "LAUNDRY"
  ) {
    return `${base} · ${opts.runner.displayName}`;
  }
  return base;
}
