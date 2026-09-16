export type HealthFollowupStatus = "SCHEDULED" | "SENT" | "CANCELLED";

/** Lời nhắc chỉ được đặt tối đa 1 năm phía trước. */
export const HEALTH_FOLLOWUP_MAX_DAYS = 365;

export function isHealthFollowupPending(status: string): boolean {
  return status === "SCHEDULED";
}

/** Đã nhắc hoặc đang chờ — không cho đặt thêm. */
export function isHealthFollowupLocked(status: string): boolean {
  return status === "SCHEDULED" || status === "SENT";
}

/**
 * Mốc nhắc theo số ngày — ngày mục tiêu lúc 09:00 theo giờ máy chủ.
 * Bác sĩ chỉ chọn số ngày; không chọn giờ trên UI.
 */
export function remindAtFromDays(days: number, from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}
