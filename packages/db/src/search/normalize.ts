/** Vietnamese search normalization + synonym expand (config/DB driven). */

const VI_MAP: Record<string, string> = {
  à: "a",
  á: "a",
  ả: "a",
  ã: "a",
  ạ: "a",
  ă: "a",
  ằ: "a",
  ắ: "a",
  ẳ: "a",
  ẵ: "a",
  ặ: "a",
  â: "a",
  ầ: "a",
  ấ: "a",
  ẩ: "a",
  ẫ: "a",
  ậ: "a",
  è: "e",
  é: "e",
  ẻ: "e",
  ẽ: "e",
  ẹ: "e",
  ê: "e",
  ề: "e",
  ế: "e",
  ể: "e",
  ễ: "e",
  ệ: "e",
  ì: "i",
  í: "i",
  ỉ: "i",
  ĩ: "i",
  ị: "i",
  ò: "o",
  ó: "o",
  ỏ: "o",
  õ: "o",
  ọ: "o",
  ô: "o",
  ồ: "o",
  ố: "o",
  ổ: "o",
  ỗ: "o",
  ộ: "o",
  ơ: "o",
  ờ: "o",
  ớ: "o",
  ở: "o",
  ỡ: "o",
  ợ: "o",
  ù: "u",
  ú: "u",
  ủ: "u",
  ũ: "u",
  ụ: "u",
  ư: "u",
  ừ: "u",
  ứ: "u",
  ử: "u",
  ữ: "u",
  ự: "u",
  ỳ: "y",
  ý: "y",
  ỷ: "y",
  ỹ: "y",
  ỵ: "y",
  đ: "d",
};

export function stripVietnameseDiacritics(input: string): string {
  let out = "";
  const lower = input.toLowerCase();
  for (const ch of lower) {
    out += VI_MAP[ch] ?? ch;
  }
  return out;
}

export function normalizeSearchQuery(raw: string): string {
  return stripVietnameseDiacritics(raw)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Built-in fallbacks if DB synonyms empty / offline. */
export const BUILTIN_SYNONYMS: Record<string, string[]> = {
  ship: ["giao hàng"],
  delivery: ["giao hàng"],
  "giúp việc": ["dọn nhà"],
  "sửa lạnh": ["điều hòa"],
  "máy lạnh": ["điều hòa"],
  "cơm nhà": ["bữa tối", "family dinner"],
  "sáng mai": ["ăn sáng", "breakfast"],
  laundry: ["giặt"],
};

export function expandQueryTerms(raw: string, dbSynonyms: { variant: string; canonical: string }[]): string[] {
  const terms = new Set<string>();
  const trimmed = raw.trim();
  if (!trimmed) return [];
  terms.add(trimmed);
  const norm = normalizeSearchQuery(trimmed);
  if (norm) terms.add(norm);

  const lower = trimmed.toLowerCase();
  const normLower = norm.toLowerCase();

  for (const s of dbSynonyms) {
    const v = s.variant.toLowerCase();
    const vn = normalizeSearchQuery(s.variant);
    if (lower.includes(v) || normLower.includes(vn) || v === lower || vn === normLower) {
      terms.add(s.canonical);
      terms.add(normalizeSearchQuery(s.canonical));
    }
  }

  for (const [variant, canons] of Object.entries(BUILTIN_SYNONYMS)) {
    const vn = normalizeSearchQuery(variant);
    if (lower.includes(variant) || normLower.includes(vn)) {
      for (const c of canons) {
        terms.add(c);
        terms.add(normalizeSearchQuery(c));
      }
    }
  }

  return [...terms].filter(Boolean);
}
