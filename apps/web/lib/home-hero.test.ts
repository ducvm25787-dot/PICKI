import { describe, expect, it } from "vitest";
import { contextNowFor } from "./home-hero";

function at(hour: number, day = 1) {
  return new Date(2026, 9, day, hour, 0, 0);
}

describe("home food daypart priority", () => {
  it("shows breakfast, lunch, dinner, then tomorrow breakfast", () => {
    expect(contextNowFor(at(8)).title).toBe("Ăn sáng");
    expect(contextNowFor(at(10)).title).toBe("Bữa trưa vui vẻ");
    expect(contextNowFor(at(15)).title).toBe("Tối nay nhà mình ăn gì?");
    expect(contextNowFor(at(21)).title).toBe("Sáng mai ăn gì?");
  });

  it("does not fall back to dinner overnight or on weekend lunch", () => {
    expect(contextNowFor(at(2)).title).toBe("Quanh bạn lúc này");
    expect(contextNowFor(at(2)).href).not.toBe("/family-dinner");
    expect(contextNowFor(at(10, 3)).title).toBe("Bữa trưa vui vẻ");
    expect(contextNowFor(at(15, 3)).href).toBe("/family-dinner");
  });
});
