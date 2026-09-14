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

/** Grab-like: Quán nhận → Runner → Nấu → Sẵn sàng → Bàn giao → Giao → Xong */
export const ORDER_FLOW_STEPS = [
  { key: "PROVIDER_ACCEPTED", label: "Quán nhận" },
  { key: "RUNNER_ASSIGNED", label: "Runner" },
  { key: "PREPARING", label: "Nấu" },
  { key: "READY", label: "Sẵn sàng" },
  { key: "PICKED_UP", label: "Bàn giao" },
  { key: "DELIVERING", label: "Giao" },
  { key: "DELIVERED", label: "Xong" },
] as const;

export function orderStepIndex(status: string): number {
  const map: Record<string, number> = {
    CREATED: -1,
    PAID: -1,
    PROVIDER_ACCEPTED: 0,
    RUNNER_ASSIGNED: 1,
    PREPARING: 2,
    READY: 3,
    PICKED_UP: 4,
    DELIVERING: 5,
    DELIVERED: 6,
  };
  return map[status] ?? -1;
}

type HandoffOpts = {
  estimatedReadyAt?: string | null;
  providerHandoffAt?: string | null;
  runner?: { displayName: string } | null;
};

export function orderStatusWithEta(status: string, estimatedReadyAt?: string | null): string {
  return orderStatusRich(status, { estimatedReadyAt });
}

export function orderStatusRich(status: string, opts: HandoffOpts = {}): string {
  let base = orderStatusLabel(status);
  const eta = formatEstimatedReady(opts.estimatedReadyAt);

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
