import { describe, expect, it } from "vitest";
import { applyDeliveryPromotion } from "./delivery-promotion.js";
import {
  applyRunnerWaitFee,
  normalizePlaceCode,
  placeAccessNote,
  placeWaitForHandoff,
} from "./place-access.js";

const ct12a = {
  id: "place-1",
  kind: "BUILDING" as const,
  code: "CT12A",
  displayName: "CT12A",
  elevatorNote: "Thang máy cần thẻ từ sảnh",
  accessCardRequired: true,
  securityNote: "Bảo vệ trực sảnh",
  callUpRequired: true,
  doorDeliveryAllowed: true,
  lobbyWaitMinutes: 3,
  doorWaitMinutes: 8,
  runnerFeePerMinuteVnd: 1_000,
  notes: null,
};

describe("place access", () => {
  it("normalizes building codes", () => {
    expect(normalizePlaceCode(" ct12a ")).toBe("CT12A");
    expect(normalizePlaceCode("ct 12 a")).toBe("CT12A");
  });

  it("prices door and lobby wait separately", () => {
    expect(placeWaitForHandoff(ct12a, "DOOR_DELIVERY")).toEqual({
      waitMinutes: 8,
      runnerWaitFeeVnd: 8_000,
    });
    expect(placeWaitForHandoff(ct12a, "LOBBY_PICKUP")).toEqual({
      waitMinutes: 3,
      runnerWaitFeeVnd: 3_000,
    });
  });

  it("writes the handoff the runner needs", () => {
    const note = placeAccessNote(ct12a, "DOOR_DELIVERY", 8);
    expect(note).toContain("Cần thẻ thang máy");
    expect(note).toContain("Bảo vệ gọi lên căn");
    expect(note).toContain("Giao lên căn hộ");
    expect(note).toContain("8 phút");
  });

  it("adds wait onto runner payable without charging the customer or the Opening Week cap", () => {
    const funded = applyDeliveryPromotion({
      baseVnd: 20_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: {
        id: "opening",
        sponsorType: "PICKEE",
        subsidyMode: "COVER_UP_TO",
        maxSubsidyPerOrderVnd: 20_000,
        providerShareVnd: 0,
        pickeeShareVnd: 0,
        minimumOrderVnd: 0,
        eligibleModes: ["PICKEE_RUNNER"],
      },
    });
    const next = applyRunnerWaitFee(funded, 8_000);
    expect(next.customerDeliveryFee).toBe(0);
    expect(next.pickeeDeliverySubsidy).toBe(20_000);
    expect(next.deliveryFeeBase).toBe(20_000);
    expect(next.runnerPayable).toBe(28_000);
  });
});
