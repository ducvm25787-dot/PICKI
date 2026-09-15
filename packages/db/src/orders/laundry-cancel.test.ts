import { describe, expect, it } from "vitest";
import { canCustomerCancel } from "./transitions.js";

describe("laundry customer cancel before collection", () => {
  it("allows cancel at CREATED and PROVIDER_ACCEPTED", () => {
    expect(canCustomerCancel("CREATED", "LAUNDRY", "HOME_PICKUP")).toBe(true);
    expect(canCustomerCancel("PROVIDER_ACCEPTED", "LAUNDRY", "HOME_PICKUP")).toBe(true);
    expect(canCustomerCancel("PROVIDER_ACCEPTED", "LAUNDRY", "SHOP_DROP_OFF")).toBe(true);
    expect(canCustomerCancel("PROVIDER_ACCEPTED", "LAUNDRY", "ON_SITE")).toBe(true);
  });

  it("blocks cancel after shop collected or processing", () => {
    expect(canCustomerCancel("AT_SHOP", "LAUNDRY", "HOME_PICKUP")).toBe(false);
    expect(canCustomerCancel("PROCESSING", "LAUNDRY", "HOME_PICKUP")).toBe(false);
    expect(canCustomerCancel("PROCESSING", "LAUNDRY", "ON_SITE")).toBe(false);
  });
});
