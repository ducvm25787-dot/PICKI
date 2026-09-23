/** Lean REGULAR/VIP labels for provider order UI (Habit-First P1). */

export type LoyaltyLabel = "NEW" | "RETURNING" | "REGULAR" | "VIP";

export function loyaltyLabelVi(label: LoyaltyLabel | string): string {
  switch (label) {
    case "VIP":
      return "VIP";
    case "REGULAR":
      return "Quen";
    case "RETURNING":
      return "Quay lại";
    case "NEW":
      return "Mới";
    default:
      return label;
  }
}

export function loyaltyLabelClass(label: LoyaltyLabel | string): string {
  switch (label) {
    case "VIP":
      return "loyalty-pill loyalty-vip";
    case "REGULAR":
      return "loyalty-pill loyalty-regular";
    case "RETURNING":
      return "loyalty-pill loyalty-returning";
    default:
      return "loyalty-pill loyalty-new";
  }
}
