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
    case "PROVIDER_REJECTED":
      return "Quán từ chối";
    case "CUSTOMER_CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}
