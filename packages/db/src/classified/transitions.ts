export type ClassifiedListingType = "RESALE" | "GIVE_AWAY";

export type ClassifiedStatus =
  | "DRAFT"
  | "AVAILABLE"
  | "RESERVED"
  | "COMPLETED"
  | "GIVEN"
  | "ARCHIVED";

export type ClassifiedAction = "reserve" | "complete" | "cancel_reservation" | "archive" | "publish";

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

export function classifiedCompleteStatus(listingType: ClassifiedListingType): "COMPLETED" | "GIVEN" {
  return listingType === "GIVE_AWAY" ? "GIVEN" : "COMPLETED";
}

export function isClassifiedBrowsable(status: string): boolean {
  return status === "AVAILABLE" || status === "RESERVED";
}

export function isClassifiedTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "GIVEN" || status === "ARCHIVED";
}
