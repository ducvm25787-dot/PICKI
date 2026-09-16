export type ClassifiedListingType =
  | "RESALE"
  | "GIVE_AWAY"
  | "CHO_THUE"
  | "O_GHEP"
  | "LOST_FOUND"
  | "PET_LOST";

export type ClassifiedStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "RESERVED"
  | "COMPLETED"
  | "GIVEN"
  | "ARCHIVED";

export type ClassifiedAction = "reserve" | "complete" | "cancel_reservation" | "archive" | "publish";

/** Tin cho thuê / ở ghép — peer listing, không giữ chỗ. */
export const HOUSING_LISTING_TYPES: readonly ClassifiedListingType[] = ["CHO_THUE", "O_GHEP"];

/** Tin thất lạc / thú cưng thất lạc — peer listing, không giữ chỗ. */
export const LOST_LISTING_TYPES: readonly ClassifiedListingType[] = ["LOST_FOUND", "PET_LOST"];

/** TTL tin housing (ngày). */
export const HOUSING_LISTING_TTL_DAYS = 7;

/** TTL tin thất lạc (ngày). */
export const LOST_LISTING_TTL_DAYS = 14;

/** Tối đa số lần tạo tin housing / tháng lịch / user. */
export const HOUSING_LISTING_MONTHLY_CREATE_LIMIT = 2;

/** Tối đa số tin thất lạc AVAILABLE cùng lúc / user. */
export const LOST_LISTING_ACTIVE_LIMIT = 2;

/** Tối đa số lần tạo tin thất lạc / tháng lịch / user. */
export const LOST_LISTING_MONTHLY_CREATE_LIMIT = 5;

export function isHousingListingType(type: string): boolean {
  return type === "CHO_THUE" || type === "O_GHEP";
}

export function isLostListingType(type: string): boolean {
  return type === "LOST_FOUND" || type === "PET_LOST";
}

/** Peer listings chỉ CONTACT — không reserve / complete. */
export function isContactOnlyListingType(type: string): boolean {
  return isHousingListingType(type) || isLostListingType(type);
}

export function housingExpiresAt(from = new Date(), ttlDays = HOUSING_LISTING_TTL_DAYS): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ttlDays);
  return d;
}

export function lostExpiresAt(from = new Date(), ttlDays = LOST_LISTING_TTL_DAYS): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + ttlDays);
  return d;
}

const TRANSITIONS: Record<ClassifiedStatus, ClassifiedStatus[]> = {
  DRAFT: ["AVAILABLE", "ARCHIVED"],
  AVAILABLE: ["RESERVED", "ARCHIVED"],
  RESERVED: ["COMPLETED", "GIVEN", "AVAILABLE"],
  COMPLETED: ["ARCHIVED"],
  GIVEN: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canClassifiedTransition(from: string, to: ClassifiedStatus): boolean {
  const allowed = TRANSITIONS[from as ClassifiedStatus];
  return allowed?.includes(to) ?? false;
}

export function classifiedCompleteStatus(
  listingType: ClassifiedListingType,
): "COMPLETED" | "GIVEN" {
  if (isContactOnlyListingType(listingType)) {
    throw new Error("Contact-only listings do not use complete/reserve");
  }
  return listingType === "GIVE_AWAY" ? "GIVEN" : "COMPLETED";
}

export function isClassifiedBrowsable(status: string): boolean {
  return status === "AVAILABLE" || status === "RESERVED";
}

export function isClassifiedTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "GIVEN" || status === "ARCHIVED";
}
