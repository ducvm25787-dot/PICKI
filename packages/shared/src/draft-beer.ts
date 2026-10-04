/** Ops capability. Not a provider type. Only draft beer poured at the shop. */
export const DRAFT_BEER_CAPABILITY = "DRAFT_BEER_SALES" as const;

export const DRAFT_BEER_OFFERING_NAME = "Bia hơi";

export const DRAFT_BEER_VOLUMES = ["500ml", "1L", "2L", "5L", "10L"] as const;
export type DraftBeerVolume = (typeof DRAFT_BEER_VOLUMES)[number];

export const DRAFT_BEER_BASE_VOLUME: DraftBeerVolume = "500ml";

/** Stored as text. Callers must pass one of these values. */
export const ORDER_CANCEL_REASONS = [
  "AGE_VERIFICATION_FAILED",
  "RECIPIENT_ABSENT",
  "CUSTOMER_CANCELLED",
  "PROVIDER_REJECTED",
  "PAYMENT_FAILED",
] as const;
export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

export function isOrderCancelReason(value: string): value is OrderCancelReason {
  return (ORDER_CANCEL_REASONS as readonly string[]).includes(value);
}

export function parseOrderCancelReason(value: string): OrderCancelReason {
  const trimmed = value.trim();
  if (!isOrderCancelReason(trimmed)) {
    throw new Error("Lý do hủy không hợp lệ");
  }
  return trimmed;
}

/** Calendar age in Asia/Ho_Chi_Minh. True on the 18th birthday. */
export function isAtLeast18(dateOfBirth: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const todayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!todayMatch) return false;
  const todayYear = Number(todayMatch[1]);
  const todayMonth = Number(todayMatch[2]);
  const todayDay = Number(todayMatch[3]);
  let age = todayYear - year;
  if (todayMonth < month || (todayMonth === month && todayDay < day)) age -= 1;
  return age >= 18;
}
