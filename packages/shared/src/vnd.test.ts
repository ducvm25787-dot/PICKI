import { describe, expect, it } from "vitest";
import { vnd } from "./domain.js";
import { PickiError } from "./errors.js";

describe("vnd", () => {
  it("accepts integer amounts", () => {
    expect(vnd(45000)).toBe(45000);
  });

  it("rejects non-integers", () => {
    expect(() => vnd(45.5)).toThrow("VND amounts must be integers");
  });
});

describe("PickiError", () => {
  it("maps serviceability to 409", () => {
    const err = new PickiError("SERVICEABILITY_NOT_ELIGIBLE", "Not in service area");
    expect(err.httpStatus).toBe(409);
  });
});
