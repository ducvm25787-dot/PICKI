import { describe, expect, it } from "vitest";
import { morningOrderingOpen, morningPrepareOpen, tomorrowDate, wallClockToUtc } from "./market-morning.js";

describe("market morning schedule", () => {
  it("maps a Ho Chi Minh wall clock to UTC", () => {
    expect(wallClockToUtc("2026-10-05", "06:00").toISOString()).toBe("2026-10-04T23:00:00.000Z");
  });

  it("names tomorrow from the Vietnam calendar", () => {
    expect(tomorrowDate(new Date("2026-10-04T17:00:00.000Z"))).toBe("2026-10-06");
    expect(tomorrowDate(new Date("2026-10-04T16:59:00.000Z"))).toBe("2026-10-05");
  });

  it("uses the location cutoff, not a fixed evening hour", () => {
    const serviceDate = "2026-10-05";
    const before = new Date("2026-10-04T13:59:00.000Z");
    const atCutoff = new Date("2026-10-04T14:00:00.000Z");
    expect(morningOrderingOpen({ now: before, serviceDate, cutoffTime: "21:00" })).toBe(true);
    expect(morningOrderingOpen({ now: atCutoff, serviceDate, cutoffTime: "21:00" })).toBe(false);
    expect(morningOrderingOpen({ now: before, serviceDate, cutoffTime: "20:00" })).toBe(false);
    expect(
      morningOrderingOpen({
        now: new Date("2026-10-04T23:30:00.000Z"),
        serviceDate,
        cutoffTime: "23:59",
      }),
    ).toBe(false);
  });

  it("opens preparation from the location lead before the slot", () => {
    const base = { serviceDate: "2026-10-05", startsAt: "06:00" };
    const tooEarly = new Date("2026-10-04T22:29:00.000Z");
    const open = new Date("2026-10-04T22:30:00.000Z");
    expect(morningPrepareOpen({ ...base, now: tooEarly, prepareLeadMinutes: 30 })).toBe(false);
    expect(morningPrepareOpen({ ...base, now: open, prepareLeadMinutes: 30 })).toBe(true);
    expect(morningPrepareOpen({ ...base, now: open, prepareLeadMinutes: 20 })).toBe(false);
  });
});
