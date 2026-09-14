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

export const LAUNDRY_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Tiệm nhận" },
  { key: "SEEKING_RUNNER", label: "Tìm runner" },
  { key: "RUNNER_ASSIGNED", label: "Runner nhận" },
  { key: "PICKED_UP", label: "Lấy đồ" },
  { key: "DELIVERING", label: "Giao tiệm" },
  { key: "AT_SHOP", label: "Tại tiệm" },
  { key: "PROCESSING", label: "Đang giặt" },
  { key: "READY_FOR_RETURN", label: "Sẵn sàng trả" },
  { key: "RETURN_RUNNER_ASSIGNED", label: "Runner giao lại" },
  { key: "RETURN_PICKED_UP", label: "Lấy tại tiệm" },
  { key: "RETURN_DELIVERING", label: "Đang giao về" },
  { key: "COMPLETED", label: "Hoàn tất" },
] as const;

export function orderStepIndex(
  status: string,
  opts: { runnerSoughtAt?: string | null; serviceVertical?: string | null } = {},
): number {
  if (opts.serviceVertical === "LAUNDRY") {
    if (status === "PROVIDER_ACCEPTED") {
      return opts.runnerSoughtAt ? 1 : 0;
    }
    const laundryMap: Record<string, number> = {
      CREATED: -1,
      PAID: -1,
      RUNNER_ASSIGNED: 2,
      PICKED_UP: 3,
      DELIVERING: 4,
      AT_SHOP: 5,
      PROCESSING: 6,
      READY_FOR_RETURN: 7,
      RETURN_RUNNER_ASSIGNED: 8,
      RETURN_PICKED_UP: 9,
      RETURN_DELIVERING: 10,
      COMPLETED: 11,
      DELIVERED: 5,
    };
    return laundryMap[status] ?? -1;
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

export function orderFlowSteps(serviceVertical?: string | null) {
  return serviceVertical === "LAUNDRY" ? LAUNDRY_FLOW_STEPS : ORDER_FLOW_STEPS;
}

type HandoffOpts = {
  estimatedReadyAt?: string | null;
  providerHandoffAt?: string | null;
  runnerSoughtAt?: string | null;
  runner?: { displayName: string } | null;
};

export function orderStatusWithEta(status: string, estimatedReadyAt?: string | null): string {
  return orderStatusRich(status, { estimatedReadyAt });
}

export function orderStatusRich(status: string, opts: HandoffOpts = {}): string {
  let base = orderStatusLabel(status);
  const eta = formatEstimatedReady(opts.estimatedReadyAt);

  if (status === "PROVIDER_ACCEPTED") {
    if (opts.runnerSoughtAt) {
      return "Đang tìm runner — chờ runner nhận giao";
    }
    return "Quán đã nhận — bấm Tìm runner";
  }

  if (opts.runner && status !== "CREATED" && status !== "PAID" && status !== "PROVIDER_ACCEPTED") {
    base = `${base} · Runner: ${opts.runner.displayName}`;
  }

  if (eta && status === "PREPARING") {
    return `${base} · ${eta}`;
  }
  if (status === "READY") {
    if (opts.providerHandoffAt) {
      return `${base} · Quán đã giao — chờ runner xác nhận`;
    }
    return `${base} · Chờ quán giao cho runner`;
  }
  if (status === "RUNNER_ASSIGNED") {
    return `${base}${opts.runner ? ` (${opts.runner.displayName})` : ""}`;
  }
  return base;
}
