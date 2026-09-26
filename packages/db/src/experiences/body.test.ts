import assert from "node:assert/strict";
import test from "node:test";
import { normalizePastedCaption, renderExperienceBody } from "./body.js";

test("pasted caption keeps line breaks and emoji", () => {
  const text = normalizePastedCaption("Tối nay 🎵\n\nHai suất.\nMang theo trẻ em.");
  assert.equal(text, "Tối nay 🎵\n\nHai suất.\nMang theo trẻ em.");
});

test("html in a paste becomes text, not markup", () => {
  const text = normalizePastedCaption("<p>Xin chào</p><script>alert(1)</script>");
  assert.equal(text.includes("<script>"), false);
  assert.match(text, /Xin chào/);
  assert.match(text, /alert\(1\)/);
});

test("body renders heading, bullet, bold, and http links only", () => {
  const blocks = renderExperienceBody(
    "## Đêm nhạc\n\nMột tối **rất** đáng đi.\n- Gia đình\nXem [vé](https://ticket.example/a) và javascript:alert(1)",
  );
  assert.equal(blocks[0]?.type, "heading");
  assert.equal(blocks.some((block) => block.type === "bullet"), true);
  const paragraph = blocks.find((block) => block.type === "paragraph");
  assert.ok(paragraph);
  assert.equal(
    blocks.some((block) => block.inlines.some((item) => item.kind === "bold")),
    true,
  );
  assert.equal(
    blocks.some(
      (block) =>
        block.inlines.some((item) => item.kind === "link" && item.href.startsWith("https://")),
    ),
    true,
  );
  assert.equal(JSON.stringify(blocks).includes("javascript:"), true);
  assert.equal(
    blocks.some((block) => block.inlines.some((item) => item.kind === "link" && item.href.startsWith("javascript:"))),
    false,
  );
});
