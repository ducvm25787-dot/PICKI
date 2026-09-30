import { describe, expect, it } from "vitest";
import {
  countFamilyDinnerPortions,
  familyDinnerRiceLineTotalVnd,
  grossFromNet,
  lateOfferMaxCapacity,
  toBuyQuantity,
  validateFamilyDinnerBaseMeal,
} from "./rules.js";

describe("validateFamilyDinnerBaseMeal", () => {
  it("allows a skipped course and lists it", () => {
    const r = validateFamilyDinnerBaseMeal([
      { category: "MAIN", quantity: 1 },
      { category: "SIDE", quantity: 1 },
      { category: "VEGETABLE", quantity: 1 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.missing).toEqual(["SOUP"]);
  });

  it("allows rice alone and rejects an empty tray", () => {
    const rice = validateFamilyDinnerBaseMeal([{ category: "RICE", quantity: 1 }]);
    expect(rice.ok).toBe(true);
    const empty = validateFamilyDinnerBaseMeal([]);
    expect(empty.ok).toBe(false);
    const extraOnly = validateFamilyDinnerBaseMeal([{ category: "EXTRA", quantity: 2 }]);
    expect(extraOnly.ok).toBe(false);
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

  it("allows multiple dishes per group", () => {
    const r = validateFamilyDinnerBaseMeal([
      { category: "MAIN", quantity: 1 },
      { category: "MAIN", quantity: 1 },
      { category: "SIDE", quantity: 1 },
      { category: "VEGETABLE", quantity: 1 },
      { category: "SOUP", quantity: 1 },
    ]);
    expect(r.ok).toBe(true);
  });

  it("counts portions", () => {
    expect(countFamilyDinnerPortions([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });
});

describe("rice extra portions", () => {
  it("first portion = menu price; each extra +5k", () => {
    expect(familyDinnerRiceLineTotalVnd(15_000, 1)).toBe(15_000);
    expect(familyDinnerRiceLineTotalVnd(15_000, 2)).toBe(20_000);
    expect(familyDinnerRiceLineTotalVnd(15_000, 3)).toBe(25_000);
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
