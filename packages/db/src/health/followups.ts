export type HealthFollowupStatus = "SCHEDULED" | "SENT" | "CANCELLED";

/** Lời nhắc chỉ được đặt tối đa 1 năm phía trước. */
export const HEALTH_FOLLOWUP_MAX_DAYS = 365;

export function isHealthFollowupPending(status: string): boolean {
  return status === "SCHEDULED";
}
