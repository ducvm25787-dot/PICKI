import { describe, expect, it } from "vitest";
import { shouldAutoSeekRunner } from "./auto-seek.js";

const accepted = {
  serviceVertical: "FOOD",
  orderKind: "STANDARD",
  status: "PROVIDER_ACCEPTED",
  runnerUserId: null,
  runnerSoughtAt: null,
  runnerSearchCancelledAt: null,
  scheduledDeliveryWindowId: null,
};

describe("shouldAutoSeekRunner", () => {
  it("still seeks a runner for an accepted sell-now order", () => {
    expect(shouldAutoSeekRunner(accepted)).toBe(true);
  });

  it("does not seek a runner for a morning market order", () => {
    expect(
      shouldAutoSeekRunner({
        ...accepted,
        scheduledDeliveryWindowId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe(false);
  });

  it("does not seek a runner for cook-first or laundry orders", () => {
    expect(shouldAutoSeekRunner({ ...accepted, orderKind: "FAMILY_DINNER" })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, orderKind: "BREAKFAST_PREORDER" })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, orderKind: "LUNCH" })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, serviceVertical: "LAUNDRY" })).toBe(false);
  });

  it("does not seek again after a search was started or cancelled", () => {
    expect(shouldAutoSeekRunner({ ...accepted, runnerSoughtAt: new Date() })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, runnerSearchCancelledAt: new Date() })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, runnerUserId: "runner" })).toBe(false);
    expect(shouldAutoSeekRunner({ ...accepted, status: "READY" })).toBe(false);
  });
});
