import { isCookFirstFoodOrder } from "../orders/transitions.js";

export type CancelFindRunnerOrder = {
  serviceVertical: string;
  orderKind?: string | null;
  status: string;
  runnerUserId: string | null;
  runnerSoughtAt: Date | string | null;
};

export type CancelFindRunnerDecision =
  | { ok: true; status: "READY" | "PROVIDER_ACCEPTED" }
  | { ok: false; message: string };

/** Clear runner search without changing status and without switching to self-delivery. */
export function decideCancelFindRunner(order: CancelFindRunnerOrder): CancelFindRunnerDecision {
  if (order.serviceVertical === "LAUNDRY") {
    return { ok: false, message: "Đơn giặt dùng Hủy gọi runner ở chặng trả" };
  }
  if (order.runnerUserId) {
    return { ok: false, message: "Runner đã nhận đơn — không hủy tìm" };
  }
  if (!order.runnerSoughtAt) {
    return { ok: false, message: "Chưa tìm runner" };
  }
  if (order.status === "READY") {
    return { ok: true, status: "READY" };
  }
  if (isCookFirstFoodOrder(order)) {
    return { ok: false, message: "Chỉ hủy tìm runner khi món đã sẵn sàng giao" };
  }
  if (order.status !== "PROVIDER_ACCEPTED") {
    return { ok: false, message: "Chỉ hủy tìm runner khi đơn đang chờ runner" };
  }
  return { ok: true, status: "PROVIDER_ACCEPTED" };
}

export function selfDeliveryStatus(): "DELIVERING" {
  return "DELIVERING";
}

export function customerPickupStatus(): "DELIVERED" {
  return "DELIVERED";
}
