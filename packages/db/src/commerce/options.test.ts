import { describe, expect, it } from "vitest";
import { resolveOptionSelection, type OptionGroupView } from "./options.js";

const groups: OptionGroupView[] = [
  {
    id: "g1",
    name: "Loại",
    selection: "SINGLE",
    required: true,
    maxSelect: 1,
    options: [
      { id: "o1", name: "Mọc", priceDeltaVnd: 0 },
      { id: "o2", name: "Bò", priceDeltaVnd: 10000 },
    ],
  },
  {
    id: "g2",
    name: "Thêm",
    selection: "MULTI",
    required: false,
    maxSelect: 2,
    options: [
      { id: "o3", name: "Quẩy", priceDeltaVnd: 5000 },
      { id: "o4", name: "Trứng", priceDeltaVnd: 8000 },
    ],
  },
];

describe("resolveOptionSelection", () => {
  it("adds the chosen deltas and keeps a dish without groups unchanged", () => {
    const picked = resolveOptionSelection(groups, ["o2", "o3"]);
    expect(picked).toMatchObject({ ok: true, extraVnd: 15000 });
    expect(resolveOptionSelection([], [])).toEqual({ ok: true, extraVnd: 0, snapshot: [] });
  });

  it("requires exactly one choice in a single group", () => {
    expect(resolveOptionSelection(groups, []).ok).toBe(false);
    expect(resolveOptionSelection(groups, ["o1", "o2"]).ok).toBe(false);
    expect(resolveOptionSelection(groups, ["o9"]).ok).toBe(false);
  });
});
