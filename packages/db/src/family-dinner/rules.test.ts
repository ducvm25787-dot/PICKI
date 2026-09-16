import { describe, expect, it } from "vitest";
import {
  countFamilyDinnerPortions,
  grossFromNet,
  lateOfferMaxCapacity,
  toBuyQuantity,
  validateFamilyDinnerBaseMeal,
} from "./rules.js";

describe("validateFamilyDinnerBaseMeal", () => {
  it("requires all four groups", () => {
    const r = validateFamilyDinnerBaseMeal([
      { category: "MAIN", quantity: 1 },
      { category: "SIDE", quantity: 1 },
      { category: "VEGETABLE", quantity: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(["SOUP"]);
  });

  it("passes with four groups + extras", () => {
    const r = validateFamilyDinnerBaseMeal([
      { category: "MAIN", quantity: 1 },
      { category: "SIDE", quantity: 2 },
      { category: "VEGETABLE", quantity: 1 },
      { category: "SOUP", quantity: 1 },
      { category: "EXTRA", quantity: 3 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("counts portions", () => {
    expect(countFamilyDinnerPortions([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });
});

describe("recipe math", () => {
  it("grossFromNet applies yield", () => {
    expect(grossFromNet(5000, 85)).toBeCloseTo(5882.353, 2);
  });

  it("toBuyQuantity", () => {
    expect(toBuyQuantity(10.8, 4)).toBe(6.8);
    expect(toBuyQuantity(5, 8)).toBe(0);
  });

  it("lateOfferMaxCapacity uses min across dishes", () => {
    expect(
      lateOfferMaxCapacity([
        { remaining: 6, quantityPerTray: 1 },
        { remaining: 8, quantityPerTray: 1 },
        { remaining: 5, quantityPerTray: 1 },
        { remaining: 4, quantityPerTray: 1 },
      ]),
    ).toBe(4);
  });
});
