import { describe, expect, it } from "vitest";
import { decideHistoricalFulfillment } from "./delivery-backfill.js";
import { decideCancelFindRunner } from "./fulfillment-actions.js";
import { canTransition } from "../orders/transitions.js";

const base = {
  serviceVertical: "FOOD",
  orderKind: "STANDARD",
  status: "DELIVERED",
  runnerUserId: null as string | null,
  runnerSoughtAt: null as string | null,
  legacyDeliveryFeeVnd: 15_000,
  assignmentStatuses: [] as string[],
  hasAcceptedOffer: false,
};

describe("historical fulfillment backfill", () => {
  it("uses runner_user_id as assignment evidence", () => {
    const decision = decideHistoricalFulfillment({
      ...base,
      runnerUserId: "runner-1",
    });
    expect(decision.fulfillmentMode).toBe("PICKEE_RUNNER");
    expect(decision.runnerPayable).toBe(15_000);
    expect(decision.ambiguous).toBe(false);
    expect(decision.reason).toBe("runner_assignment_evidence");
  });

  it("uses status history and an accepted offer", () => {
    expect(
      decideHistoricalFulfillment({
        ...base,
        assignmentStatuses: ["RUNNER_ASSIGNED"],
      }).reason,
    ).toBe("runner_assignment_evidence");
    expect(
      decideHistoricalFulfillment({
        ...base,
        status: "DELIVERED",
        hasAcceptedOffer: true,
      }).fulfillmentMode,
    ).toBe("PICKEE_RUNNER");
  });

  it("does not treat runner_sought_at alone as a completed Pickee runner delivery", () => {
    const decision = decideHistoricalFulfillment({
      ...base,
      orderKind: "FAMILY_DINNER",
      status: "DELIVERED",
      runnerSoughtAt: "2026-09-30T10:00:00.000Z",
    });
    expect(decision.fulfillmentMode).toBe("PROVIDER_SELF_DELIVERY");
    expect(decision.runnerPayable).toBe(0);
    expect(decision.providerDeliveryEarning).toBe(15_000);
    expect(decision.deliveryFeeVnd).toBe(15_000);
    expect(decision.ambiguous).toBe(false);
  });

  it("infers self-delivery only for cook-first DELIVERING or DELIVERED without a runner", () => {
    expect(
      decideHistoricalFulfillment({
        ...base,
        orderKind: "BREAKFAST_PREORDER",
        status: "DELIVERING",
      }).fulfillmentMode,
    ).toBe("PROVIDER_SELF_DELIVERY");
    expect(
      decideHistoricalFulfillment({
        ...base,
        orderKind: "FAMILY_DINNER",
        status: "READY",
        runnerSoughtAt: "2026-09-30T10:00:00.000Z",
      }).fulfillmentMode,
    ).toBe("PICKEE_RUNNER");
  });

  it("flags a standard delivered order with no runner evidence as ambiguous", () => {
    const decision = decideHistoricalFulfillment({
      ...base,
      status: "DELIVERED",
      runnerSoughtAt: "2026-09-30T10:00:00.000Z",
    });
    expect(decision.ambiguous).toBe(true);
    expect(decision.fulfillmentMode).toBe("PICKEE_RUNNER");
    expect(decision.runnerPayable).toBe(0);
    expect(decision.customerDeliveryFee).toBe(15_000);
  });

  it("keeps laundry customer fee at 0 and moves a proven return fee onto runner payable", () => {
    const decision = decideHistoricalFulfillment({
      ...base,
      serviceVertical: "LAUNDRY",
      orderKind: "STANDARD",
      status: "COMPLETED",
      laundryPickupMode: "HOME_PICKUP",
      runnerUserId: "runner-1",
      legacyDeliveryFeeVnd: 15_000,
    });
    expect(decision.customerDeliveryFee).toBe(0);
    expect(decision.deliveryFeeVnd).toBe(0);
    expect(decision.deliveryFeeBase).toBe(0);
    expect(decision.runnerPayable).toBe(15_000);
  });
});

describe("cancel find runner", () => {
  it("keeps a cook-first order at READY", () => {
    expect(
      decideCancelFindRunner({
        serviceVertical: "FOOD",
        orderKind: "FAMILY_DINNER",
        status: "READY",
        runnerUserId: null,
        runnerSoughtAt: "2026-09-30T10:00:00.000Z",
      }),
    ).toEqual({ ok: true, status: "READY" });
  });

  it("keeps a sell-now order at PROVIDER_ACCEPTED", () => {
    expect(
      decideCancelFindRunner({
        serviceVertical: "FOOD",
        orderKind: "STANDARD",
        status: "PROVIDER_ACCEPTED",
        runnerUserId: null,
        runnerSoughtAt: "2026-09-30T10:00:00.000Z",
      }),
    ).toEqual({ ok: true, status: "PROVIDER_ACCEPTED" });
  });

  it("refuses after a runner has accepted", () => {
    const decision = decideCancelFindRunner({
      serviceVertical: "FOOD",
      orderKind: "STANDARD",
      status: "PROVIDER_ACCEPTED",
      runnerUserId: "runner-1",
      runnerSoughtAt: "2026-09-30T10:00:00.000Z",
    });
    expect(decision.ok).toBe(false);
  });
});

describe("fulfillment transitions", () => {
  it("allows READY → DELIVERED only for customer pickup", () => {
    expect(canTransition("READY", "DELIVERED", "FOOD", null, "FAMILY_DINNER", "CUSTOMER_PICKUP")).toBe(
      true,
    );
    expect(canTransition("READY", "DELIVERED", "FOOD", null, "FAMILY_DINNER", "PICKEE_RUNNER")).toBe(
      false,
    );
  });

  it("still allows self-delivery READY → DELIVERING", () => {
    expect(canTransition("READY", "DELIVERING", "FOOD", null, "FAMILY_DINNER")).toBe(true);
  });
});
