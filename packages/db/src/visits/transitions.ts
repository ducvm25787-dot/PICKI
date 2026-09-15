export type VisitIntentStatus = "ACTIVE" | "ARRIVED" | "CANCELLED" | "EXPIRED";

export function isVisitIntentActive(status: string): boolean {
  return status === "ACTIVE";
}

export function visitIntentProviderActionToStatus(
  action: "waiting" | "arrived" | "dismiss",
): VisitIntentStatus | null {
  if (action === "waiting") return null;
  switch (action) {
    case "arrived":
      return "ARRIVED";
    case "dismiss":
      return "CANCELLED";
    default:
      return null;
  }
}
