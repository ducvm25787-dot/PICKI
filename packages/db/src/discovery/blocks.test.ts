import { describe, expect, it } from "vitest";
import { discoveryBlocksForNow } from "./blocks.js";

describe("discoveryBlocksForNow", () => {
  it("shows lunch block around noon Vietnam time", () => {
    const noon = new Date("2026-09-14T05:00:00.000Z"); // 12:00 ICT
    const blocks = discoveryBlocksForNow(noon);
    expect(blocks[0]?.id).toBe("lunch");
  });

  it("shows breakfast preorder late evening", () => {
    const evening = new Date("2026-09-14T14:30:00.000Z"); // 21:30 ICT
    const blocks = discoveryBlocksForNow(evening);
    expect(blocks.some((b) => b.id === "breakfast-preorder")).toBe(true);
  });
});
