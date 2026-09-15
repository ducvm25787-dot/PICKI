export type VisitIntentStatus = "ACTIVE" | "ARRIVED" | "CANCELLED" | "EXPIRED";

export function isVisitIntentActive(status: string): boolean {
  return status === "ACTIVE";
}

export function visitIntentProviderActionToStatus(
  action: "arrived" | "dismiss",
): VisitIntentStatus | null {
  switch (action) {
    case "arrived":
      return "ARRIVED";
    case "dismiss":
      return "CANCELLED";
    default:
      return null;
  }
}
