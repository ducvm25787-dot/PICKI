import { describe, expect, it } from "vitest";
import {
  breakfastSellPhase,
  isLunchSellOpen,
} from "./daypart-menu.js";

describe("breakfast sell phase", () => {
  const serviceDate = "2026-10-02";

  it("keeps the evening preorder window", () => {
    expect(
      breakfastSellPhase(serviceDate, "20:00", "23:30", new Date("2026-10-01T14:00:00.000Z")),
    ).toBe("PREORDER");
  });

  it("stays closed after cutoff and before 06:00", () => {
    expect(
      breakfastSellPhase(serviceDate, "20:00", "23:30", new Date("2026-10-01T17:30:00.000Z")),
    ).toBe("CLOSED");
  });

  it("sells the same menu again from 06:00 to 09:00", () => {
    expect(
      breakfastSellPhase(serviceDate, "20:00", "23:30", new Date("2026-10-01T23:30:00.000Z")),
    ).toBe("MORNING");
    expect(
      breakfastSellPhase(serviceDate, "20:00", "23:30", new Date("2026-10-02T01:30:00.000Z")),
    ).toBe("MORNING");
    expect(
      breakfastSellPhase(serviceDate, "20:00", "23:30", new Date("2026-10-02T02:00:00.000Z")),
    ).toBe("CLOSED");
  });
});

describe("lunch window", () => {
  it("is open only 09:00–13:00 on the service date", () => {
    expect(isLunchSellOpen("2026-10-02", new Date("2026-10-02T01:30:00.000Z"))).toBe(false);
    expect(isLunchSellOpen("2026-10-02", new Date("2026-10-02T03:00:00.000Z"))).toBe(true);
    expect(isLunchSellOpen("2026-10-02", new Date("2026-10-02T05:59:00.000Z"))).toBe(true);
    expect(isLunchSellOpen("2026-10-02", new Date("2026-10-02T06:00:00.000Z"))).toBe(false);
  });
});
