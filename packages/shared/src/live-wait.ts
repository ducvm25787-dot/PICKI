/** Beauty V1 — display-only wait labels (no queue engine). Master Spec §84, §51. */
export function beautyWaitLabel(
  status: string,
  waitMinutes: number | null | undefined,
): string {
  if (status === "CLOSED") return "Tạm hết lượt";
  if (status === "OFFLINE") return "Đóng cửa";
  const wait = waitMinutes ?? 0;
  if (status === "OPEN" && wait <= 0) return "Ra được ngay";
  if (wait <= 15) return wait > 0 ? `~${String(wait)} phút` : "~15 phút";
  return `~${String(wait)} phút`;
}

export function beautyWaitEmoji(status: string, waitMinutes: number | null | undefined): string {
  if (status === "CLOSED" || status === "OFFLINE") return "🔴";
  const wait = waitMinutes ?? 0;
  if (status === "OPEN" && wait <= 0) return "🟢";
  if (wait <= 15) return "🟡";
  return "🟠";
}
