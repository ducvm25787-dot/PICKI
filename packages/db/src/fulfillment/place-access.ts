import type { DeliveryFundingSnapshot } from "./delivery-snapshot.js";
import { assertDeliveryFundingSnapshot } from "./delivery-snapshot.js";

export type PlaceKind = "BUILDING" | "AREA";
export type PlaceHandoff = "LOBBY_PICKUP" | "DOOR_DELIVERY";

export type ZonePlaceAccess = {
  id: string;
  kind: PlaceKind;
  code: string;
  displayName: string;
  elevatorNote: string | null;
  accessCardRequired: boolean;
  securityNote: string | null;
  callUpRequired: boolean;
  doorDeliveryAllowed: boolean;
  lobbyWaitMinutes: number;
  doorWaitMinutes: number;
  runnerFeePerMinuteVnd: number;
  notes: string | null;
};

export function normalizePlaceCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export function placeWaitForHandoff(
  place: Pick<ZonePlaceAccess, "lobbyWaitMinutes" | "doorWaitMinutes" | "runnerFeePerMinuteVnd">,
  handoff: PlaceHandoff,
): { waitMinutes: number; runnerWaitFeeVnd: number } {
  const waitMinutes = handoff === "DOOR_DELIVERY" ? place.doorWaitMinutes : place.lobbyWaitMinutes;
  return {
    waitMinutes,
    runnerWaitFeeVnd: waitMinutes * place.runnerFeePerMinuteVnd,
  };
}

/** Snapshot for the runner. Does not change what the customer pays. */
export function placeAccessNote(
  place: Pick<
    ZonePlaceAccess,
    | "displayName"
    | "elevatorNote"
    | "accessCardRequired"
    | "securityNote"
    | "callUpRequired"
    | "doorDeliveryAllowed"
    | "notes"
  >,
  handoff: PlaceHandoff,
  waitMinutes: number,
): string {
  const parts: string[] = [place.displayName];
  if (place.elevatorNote) parts.push(place.elevatorNote);
  if (place.accessCardRequired) parts.push("Cần thẻ thang máy");
  if (place.securityNote) parts.push(place.securityNote);
  if (place.callUpRequired) parts.push("Bảo vệ gọi lên căn trước khi lên");
  if (handoff === "LOBBY_PICKUP" || !place.doorDeliveryAllowed) {
    parts.push("Chỉ giao tại sảnh");
  } else {
    parts.push("Giao lên căn hộ");
  }
  if (waitMinutes > 0) parts.push(`Chờ khoảng ${String(waitMinutes)} phút`);
  if (place.notes) parts.push(place.notes);
  return parts.join(" · ");
}

/**
 * Adds building wait onto runner payable only.
 * Opening Week still covers the original delivery base, not this extra.
 * The extra is added to the customer total by `customerDeliveryChargeVnd`.
 */
export function applyRunnerWaitFee(
  snapshot: DeliveryFundingSnapshot,
  runnerWaitFeeVnd: number,
): DeliveryFundingSnapshot {
  if (runnerWaitFeeVnd <= 0 || snapshot.fulfillmentMode !== "PICKEE_RUNNER") {
    return snapshot;
  }
  const next: DeliveryFundingSnapshot = {
    ...snapshot,
    runnerPayable: snapshot.runnerPayable + runnerWaitFeeVnd,
  };
  assertDeliveryFundingSnapshot(next);
  return next;
}
