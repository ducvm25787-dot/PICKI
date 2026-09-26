export type BodyInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

export type BodyBlock =
  | { type: "heading"; inlines: BodyInline[] }
  | { type: "paragraph"; inlines: BodyInline[] }
  | { type: "bullet"; inlines: BodyInline[] };

const MAX_BODY = 8000;

/** Keep paragraphs, line breaks, emoji, and links from a pasted caption. */
export function normalizePastedCaption(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n\n");
  text = text.replace(/<[^>]*>/g, "");
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
  return text.trim().slice(0, MAX_BODY);
}

export function renderExperienceBody(raw: string | null | undefined): BodyBlock[] {
  const text = normalizePastedCaption(raw ?? "");
  if (!text) return [];
  const blocks: BodyBlock[] = [];
  const lines = text.split("\n");
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const joined = paragraph.join("\n").trim();
    paragraph = [];
    if (!joined) return;
    blocks.push({ type: "paragraph", inlines: parseInlines(joined) });
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading?.[2]) {
      flushParagraph();
      blocks.push({ type: "heading", inlines: parseInlines(heading[2]) });
      continue;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(trimmed);
    if (bullet?.[1]) {
      flushParagraph();
      blocks.push({ type: "bullet", inlines: parseInlines(bullet[1]) });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

function parseInlines(line: string): BodyInline[] {
  const inlines: BodyInline[] = [];
  const pattern =
    /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g;
  let cursor = 0;
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) inlines.push({ kind: "text", text: line.slice(cursor, index) });
    if (match[1]) inlines.push({ kind: "bold", text: match[1] });
    else if (match[2]) inlines.push({ kind: "italic", text: match[2] });
    else if (match[3] && match[4] && safeHttp(match[4])) {
      inlines.push({ kind: "link", text: match[3], href: match[4] });
    } else if (match[5] && safeHttp(match[5])) {
      inlines.push({ kind: "link", text: match[5], href: match[5] });
    } else {
      inlines.push({ kind: "text", text: match[0] });
    }
    cursor = index + match[0].length;
  }
  if (cursor < line.length) inlines.push({ kind: "text", text: line.slice(cursor) });
  return inlines.filter((item) => item.kind !== "text" || item.text.length > 0);
}

function safeHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
