export type LobbyCustomerStatus = "WAITING" | "COMING_DOWN" | "RECEIVED" | "NO_RESPONSE";

export function lobbyCustomerStatusLabel(status: LobbyCustomerStatus): string {
  switch (status) {
    case "COMING_DOWN":
      return "Đang xuống";
    case "RECEIVED":
      return "Đã nhận";
    case "NO_RESPONSE":
      return "Chưa phản hồi";
    default:
      return "Chờ khách";
  }
}

export function canCompleteLobbyStop(
  handoffs: { customerStatus: string }[],
): boolean {
  if (handoffs.length === 0) return false;
  return handoffs.every(
    (h) => h.customerStatus === "RECEIVED" || h.customerStatus === "NO_RESPONSE",
  );
}
