import { describe, expect, it } from "vitest";
import { isAtLeast18, isOrderCancelReason, parseOrderCancelReason } from "./draft-beer";

describe("draft beer age and cancel reasons", () => {
  it("treats the 18th birthday in Vietnam as adult", () => {
    expect(isAtLeast18("2008-10-03", new Date("2026-10-02T16:59:00.000Z"))).toBe(false);
    expect(isAtLeast18("2008-10-03", new Date("2026-10-02T17:00:00.000Z"))).toBe(true);
  });

  it("accepts only known cancel reasons", () => {
    expect(isOrderCancelReason("AGE_VERIFICATION_FAILED")).toBe(true);
    expect(isOrderCancelReason("COD")).toBe(false);
    expect(parseOrderCancelReason(" AGE_VERIFICATION_FAILED ")).toBe("AGE_VERIFICATION_FAILED");
    expect(() => parseOrderCancelReason("bia lon")).toThrow(/không hợp lệ/);
  });
});
