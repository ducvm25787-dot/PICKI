import { describe, expect, it } from "vitest";
import { expandQueryTerms, normalizeSearchQuery, stripVietnameseDiacritics } from "./normalize.js";

describe("VN search normalize", () => {
  it("strips diacritics", () => {
    expect(stripVietnameseDiacritics("Phở Gà")).toBe("pho ga");
    expect(normalizeSearchQuery("  Cắt tóc  ")).toBe("cat toc");
  });

  it("expands synonyms", () => {
    const terms = expandQueryTerms("sửa lạnh", []);
    expect(terms.some((t) => normalizeSearchQuery(t).includes("dieu hoa"))).toBe(true);
  });
});
