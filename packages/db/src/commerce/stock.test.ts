import { describe, expect, it } from "vitest";
import { commerceServiceDate, groupStockLines, resolveScheduledOffer, resolveTodayOffer } from "./stock.js";

describe("commerce stock helpers", () => {
  it("groups lines onto one offering", () => {
    const grouped = groupStockLines([
      { offeringId: "a", quantity: 1, name: "Gà hầm" },
      { offeringId: null, quantity: 2, name: "Menu rời" },
      { offeringId: "a", quantity: 2, name: "Gà hầm" },
    ]);
    expect(grouped.get("a")).toEqual({ quantity: 3, name: "Gà hầm" });
    expect(grouped.size).toBe(1);
  });

  it("hides a dish, marks sold out, and keeps an unset dish unlimited", () => {
    expect(
      resolveTodayOffer({
        basePriceVnd: 45000,
        dayStatus: "HIDDEN",
        availableQty: null,
        reservedQty: 0,
        soldQty: 0,
        priceOverrideVnd: null,
      }).visible,
    ).toBe(false);
    const sold = resolveTodayOffer({
      basePriceVnd: 45000,
      dayStatus: "SOLD_OUT",
      availableQty: 2,
      reservedQty: 1,
      soldQty: 1,
      priceOverrideVnd: 40000,
    });
    expect(sold).toMatchObject({ visible: true, todayStatus: "SOLD_OUT", amountVnd: 40000, remaining: 0 });
    const open = resolveTodayOffer({
      basePriceVnd: 45000,
      dayStatus: null,
      availableQty: null,
      reservedQty: null,
      soldQty: null,
      priceOverrideVnd: null,
    });
    expect(open).toMatchObject({ visible: true, todayStatus: "UNSET", amountVnd: 45000, remaining: null });
  });

  it("refuses a morning line that was not opened for that date", () => {
    expect(
      resolveScheduledOffer({
        basePriceVnd: 7000,
        dayStatus: null,
        availableQty: null,
        reservedQty: null,
        soldQty: null,
        priceOverrideVnd: null,
      }),
    ).toEqual({ ok: false, reason: "closed" });
    expect(
      resolveScheduledOffer({
        basePriceVnd: 7000,
        dayStatus: "AVAILABLE",
        availableQty: null,
        reservedQty: 0,
        soldQty: 0,
        priceOverrideVnd: null,
      }),
    ).toEqual({ ok: false, reason: "closed" });
    expect(
      resolveScheduledOffer({
        basePriceVnd: 7000,
        dayStatus: "AVAILABLE",
        availableQty: 15,
        reservedQty: 2,
        soldQty: 1,
        priceOverrideVnd: null,
      }),
    ).toMatchObject({ ok: true, remaining: 12, amountVnd: 7000 });
  });

  it("uses the given service date, otherwise Hà Nội today", () => {
    expect(commerceServiceDate("2026-10-01T00:00:00.000Z")).toBe("2026-10-01");
    const today = commerceServiceDate(null, new Date("2026-09-30T18:00:00.000Z"));
    expect(today).toBe("2026-10-01");
  });
});
