/** Đơn đã kết thúc — hoàn tất, giao xong, hủy hoặc từ chối */
export const ORDER_FINISHED_STATUSES = [
  "DELIVERED",
  "COMPLETED",
  "PROVIDER_REJECTED",
  "CUSTOMER_CANCELLED",
  "SYSTEM_CANCELLED",
] as const;

export function isOrderFinished(status: string): boolean {
  return (ORDER_FINISHED_STATUSES as readonly string[]).includes(status);
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Đã đặt — chờ quán xác nhận";
    case "PAYMENT_PENDING":
      return "Chờ thanh toán online";
    case "PAID":
      return "Đã thanh toán — chờ quán";
    case "PROVIDER_ACCEPTED":
      return "Quán đã nhận";
    case "RUNNER_ASSIGNED":
      return "Runner đã nhận — chờ quán nấu";
    case "PREPARING":
      return "Đang nấu";
    case "READY":
      return "Sẵn sàng — chờ bàn giao runner";
    case "PICKED_UP":
      return "Runner đã lấy hàng tại quán";
    case "DELIVERING":
      return "Đang giao";
    case "DELIVERED":
      return "Đã giao";
    case "AT_SHOP":
      return "Đồ đã về tiệm";
    case "PROCESSING":
      return "Đang giặt / xử lý";
    case "READY_FOR_RETURN":
      return "Sẵn sàng giao lại";
    case "RETURN_RUNNER_ASSIGNED":
      return "Runner đang giao lại";
    case "RETURN_PICKED_UP":
      return "Runner lấy đồ tại tiệm";
    case "RETURN_DELIVERING":
      return "Đang giao về khách";
    case "COMPLETED":
      return "Hoàn tất";
    case "PROVIDER_REJECTED":
      return "Đơn hàng bị từ chối";
    case "CUSTOMER_CANCELLED":
      return "Khách hủy";
    case "SYSTEM_CANCELLED":
      return "Hệ thống hủy";
    case "PAYMENT_FAILED":
      return "Thanh toán lỗi";
    case "REFUNDED":
      return "Đã hoàn tiền";
    default:
      return status;
  }
}
