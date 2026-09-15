export type ServiceRequestStatus =
  | "OPEN"
  | "CONFIRMED"
  | "UPCOMING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "PROVIDER_REJECTED";

export type ServiceRequestAction =
  | "accept"
  | "reject"
  | "start"
  | "complete"
  | "cancel";

const TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  OPEN: ["CONFIRMED", "PROVIDER_REJECTED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "UPCOMING", "CANCELLED"],
  UPCOMING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  PROVIDER_REJECTED: [],
};

export function canServiceRequestTransition(from: string, to: ServiceRequestStatus): boolean {
  const allowed = TRANSITIONS[from as ServiceRequestStatus];
  return allowed?.includes(to) ?? false;
}

export function serviceRequestActionToStatus(action: ServiceRequestAction): ServiceRequestStatus | null {
  switch (action) {
    case "accept":
      return "CONFIRMED";
    case "reject":
      return "PROVIDER_REJECTED";
    case "start":
      return "IN_PROGRESS";
    case "complete":
      return "COMPLETED";
    case "cancel":
      return "CANCELLED";
    default:
      return null;
  }
}

export function isServiceRequestTerminal(status: string): boolean {
  return status === "COMPLETED" || status === "CANCELLED" || status === "PROVIDER_REJECTED";
}
