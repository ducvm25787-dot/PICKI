import {
  EXPERIENCE_AUDIENCES,
  EXPERIENCE_CATEGORIES,
  EXPERIENCE_PRICE_MODES,
  EXPERIENCE_SOURCE_TYPES,
  type ExperienceAudience,
  type ExperienceCategory,
  type ExperienceMediaStatus,
  type ExperiencePriceMode,
  type ExperienceSourceType,
} from "../schema/experiences.js";

export type FieldError = { path: string; message: string };

export type ExperienceOccurrenceImport = {
  startAt: string;
  endAt: string | null;
};

export type ExperienceImport = {
  title: string;
  city: string;
  summary: string;
  whyGo: string;
  organizer: { name: string; websiteUrl: string | null };
  venue: {
    name: string;
    address: string | null;
    lat: number | null;
    lng: number | null;
  };
  occurrences: ExperienceOccurrenceImport[];
  priceMode: ExperiencePriceMode;
  priceFrom: number | null;
  priceTo: number | null;
  priceNote: string | null;
  ageNote: string | null;
  language: string | null;
  durationMinutes: number | null;
  categories: ExperienceCategory[];
  audiences: ExperienceAudience[];
  bookingUrl: string | null;
  sourceUrl: string;
  sourceType: ExperienceSourceType;
  sourceName: string;
  bookingDeadline: string | null;
  registrationDeadline: string | null;
  soldOut: boolean;
  featuredRank: number | null;
  media: { coverUrl: string | null; mediaStatus: ExperienceMediaStatus };
};

const CATEGORY_SET = new Set<string>(EXPERIENCE_CATEGORIES);
const AUDIENCE_SET = new Set<string>(EXPERIENCE_AUDIENCES);
const PRICE_SET = new Set<string>(EXPERIENCE_PRICE_MODES);
const SOURCE_SET = new Set<string>(EXPERIENCE_SOURCE_TYPES);
const MEDIA_SET = new Set<string>(["READY", "NEEDS_REVIEW", "PLACEHOLDER"]);

export function parseExperienceImport(
  input: unknown,
  openCityCodes: readonly string[] = ["Hanoi"],
): {
  value: ExperienceImport | null;
  errors: FieldError[];
} {
  const errors: FieldError[] = [];
  const row = asRecord(input);
  if (!row) {
    return { value: null, errors: [{ path: "", message: "Mỗi mục phải là một object" }] };
  }

  const title = requiredText(row, ["title"], 180, "title", errors);
  const cityRaw = textAt(row, ["city"]);
  let city = "";
  if (!cityRaw) {
    errors.push({ path: "city", message: "Thiếu city" });
  } else if (!openCityCodes.includes(cityRaw)) {
    errors.push({ path: "city", message: "Thành phố này chưa mở" });
  } else {
    city = cityRaw;
  }
  const summary = requiredText(row, ["summary"], 500, "summary", errors);
  const whyGo = requiredText(row, ["why_go", "whyGo"], 800, "why_go", errors);

  const organizerRow = asRecord(first(row, ["organizer"]));
  const organizerName = organizerRow
    ? requiredText(organizerRow, ["name"], 160, "organizer.name", errors)
    : (errors.push({ path: "organizer.name", message: "Thiếu tên organizer" }), "");
  const websiteUrl = organizerRow
    ? optionalUrl(organizerRow, ["website_url", "websiteUrl"], "organizer.website_url", errors)
    : null;

  const venueRow = asRecord(first(row, ["venue"]));
  const venueName = venueRow
    ? requiredText(venueRow, ["name"], 160, "venue.name", errors)
    : (errors.push({ path: "venue.name", message: "Thiếu tên địa điểm" }), "");
  const address = venueRow ? optionalText(venueRow, ["address"], 240) : null;
  const lat = venueRow ? optionalNumber(venueRow, ["lat"], "venue.lat", errors) : null;
  const lng = venueRow ? optionalNumber(venueRow, ["lng"], "venue.lng", errors) : null;
  if ((lat == null) !== (lng == null)) {
    errors.push({ path: "venue.lat", message: "lat và lng phải đi cùng nhau" });
  }
  if (lat != null && (lat < -90 || lat > 90)) {
    errors.push({ path: "venue.lat", message: "lat không hợp lệ" });
  }
  if (lng != null && (lng < -180 || lng > 180)) {
    errors.push({ path: "venue.lng", message: "lng không hợp lệ" });
  }

  const occurrences = parseOccurrences(first(row, ["occurrences"]), errors);
  const priceModeRaw = textAt(row, ["price_mode", "priceMode"]);
  if (!priceModeRaw || !PRICE_SET.has(priceModeRaw)) {
    errors.push({ path: "price_mode", message: "price_mode phải là FREE, PRICED hoặc UNKNOWN" });
  }
  const priceMode = (PRICE_SET.has(priceModeRaw ?? "") ? priceModeRaw : "UNKNOWN") as ExperiencePriceMode;
  const priceFrom = optionalInt(row, ["price_from", "priceFrom"], "price_from", errors);
  const priceTo = optionalInt(row, ["price_to", "priceTo"], "price_to", errors);
  errors.push(...priceErrors(priceModeRaw && PRICE_SET.has(priceModeRaw) ? priceMode : null, priceFrom, priceTo));

  const categories = stringList(first(row, ["categories"]), "categories", CATEGORY_SET, errors);
  const audiences = stringList(first(row, ["audiences"]), "audiences", AUDIENCE_SET, errors);
  const sourceUrl = requiredUrl(row, ["source_url", "sourceUrl"], "source_url", errors);
  const sourceName = requiredText(row, ["source_name", "sourceName"], 160, "source_name", errors);
  const sourceTypeRaw = textAt(row, ["source_type", "sourceType"]);
  if (!sourceTypeRaw || !SOURCE_SET.has(sourceTypeRaw)) {
    errors.push({
      path: "source_type",
      message: "source_type phải là OFFICIAL, ORGANIZER, VENUE, TICKETING, CURATED hoặc OTHER",
    });
  }

  const mediaRow = asRecord(first(row, ["media"]));
  const coverUrl = mediaRow
    ? optionalUrl(mediaRow, ["cover_url", "coverUrl"], "media.cover_url", errors)
    : optionalUrl(row, ["cover_url", "coverUrl"], "media.cover_url", errors);
  let mediaStatus = textAt(mediaRow ?? {}, ["media_status", "mediaStatus"]);
  if (!mediaStatus) mediaStatus = coverUrl ? "NEEDS_REVIEW" : "PLACEHOLDER";
  if (!MEDIA_SET.has(mediaStatus)) {
    errors.push({ path: "media.media_status", message: "media_status không hợp lệ" });
    mediaStatus = "PLACEHOLDER";
  }
  if (mediaStatus === "READY" && !coverUrl) mediaStatus = "PLACEHOLDER";

  const featuredRaw = first(row, ["featured_rank", "featuredRank"]);
  let featuredRank: number | null = null;
  if (featuredRaw != null && featuredRaw !== "") {
    if (typeof featuredRaw !== "number" || !Number.isInteger(featuredRaw) || featuredRaw < 1) {
      errors.push({ path: "featured_rank", message: "featured_rank là số nguyên từ 1" });
    } else {
      featuredRank = featuredRaw;
    }
  }

  const priceNote = optionalText(row, ["price_note", "priceNote"], 300);
  const ageNote = optionalText(row, ["age_note", "ageNote"], 200);
  const language = optionalText(row, ["language"], 40);
  const durationMinutes = optionalInt(row, ["duration_minutes", "durationMinutes"], "duration_minutes", errors);
  const bookingUrl = optionalUrl(row, ["booking_url", "bookingUrl"], "booking_url", errors);
  const bookingDeadline = optionalInstant(row, ["booking_deadline", "bookingDeadline"], "booking_deadline", errors);
  const registrationDeadline = optionalInstant(
    row,
    ["registration_deadline", "registrationDeadline"],
    "registration_deadline",
    errors,
  );
  const soldOut = first(row, ["sold_out", "soldOut"]) === true;

  if (
    errors.length > 0 ||
    !title ||
    !summary ||
    !whyGo ||
    !organizerName ||
    !venueName ||
    !sourceUrl ||
    !sourceName ||
    !sourceTypeRaw ||
    !SOURCE_SET.has(sourceTypeRaw) ||
    !PRICE_SET.has(priceMode)
  ) {
    return { value: null, errors };
  }

  return {
    value: {
      title,
      city,
      summary,
      whyGo,
      organizer: { name: organizerName, websiteUrl },
      venue: { name: venueName, address, lat, lng },
      occurrences,
      priceMode,
      priceFrom: priceMode === "PRICED" ? priceFrom : null,
      priceTo: priceMode === "PRICED" ? priceTo : null,
      priceNote,
      ageNote,
      language,
      durationMinutes,
      categories: categories as ExperienceCategory[],
      audiences: audiences as ExperienceAudience[],
      bookingUrl,
      sourceUrl,
      sourceType: sourceTypeRaw as ExperienceSourceType,
      sourceName,
      bookingDeadline,
      registrationDeadline,
      soldOut,
      featuredRank,
      media: { coverUrl, mediaStatus: mediaStatus as ExperienceMediaStatus },
    },
    errors: [],
  };
}

export function priceErrors(
  mode: ExperiencePriceMode | null,
  priceFrom: number | null,
  priceTo: number | null,
): FieldError[] {
  if (!mode) return [];
  const errors: FieldError[] = [];
  if (mode === "FREE" || mode === "UNKNOWN") {
    if (priceFrom != null || priceTo != null) {
      errors.push({
        path: "price_mode",
        message:
          mode === "FREE"
            ? "FREE không kèm giá. Phần miễn phí của sự kiện có vé ghi bằng PRICED và price_note"
            : "UNKNOWN không kèm giá. Giá trống không có nghĩa là miễn phí",
      });
    }
    return errors;
  }
  if (priceFrom == null || priceFrom < 0) {
    errors.push({ path: "price_from", message: "PRICED cần price_from là số VND không âm" });
  }
  if (priceTo != null && priceFrom != null && priceTo < priceFrom) {
    errors.push({ path: "price_to", message: "price_to phải lớn hơn hoặc bằng price_from" });
  }
  return errors;
}

function parseOccurrences(raw: unknown, errors: FieldError[]): ExperienceOccurrenceImport[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push({ path: "occurrences", message: "Cần ít nhất một suất với start_at" });
    return [];
  }
  const occurrences: ExperienceOccurrenceImport[] = [];
  raw.forEach((item, index) => {
    const row = asRecord(item);
    if (!row) {
      errors.push({ path: `occurrences.${index}`, message: "Suất diễn phải là object" });
      return;
    }
    const startAt = optionalInstant(row, ["start_at", "startAt"], `occurrences.${index}.start_at`, errors);
    const endAt = optionalInstant(row, ["end_at", "endAt"], `occurrences.${index}.end_at`, errors);
    if (!startAt) {
      errors.push({ path: `occurrences.${index}.start_at`, message: "Thiếu start_at" });
      return;
    }
    if (endAt && Date.parse(endAt) < Date.parse(startAt)) {
      errors.push({ path: `occurrences.${index}.end_at`, message: "end_at phải sau start_at" });
    }
    occurrences.push({ startAt, endAt });
  });
  return occurrences;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function first(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function textAt(row: Record<string, unknown>, keys: string[]): string | null {
  const value = first(row, keys);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function requiredText(
  row: Record<string, unknown>,
  keys: string[],
  max: number,
  path: string,
  errors: FieldError[],
): string {
  const value = textAt(row, keys);
  if (!value) {
    errors.push({ path, message: `Thiếu ${path}` });
    return "";
  }
  if (value.length > max) {
    errors.push({ path, message: `${path} dài tối đa ${max} ký tự` });
  }
  return value;
}

function optionalText(row: Record<string, unknown>, keys: string[], max: number): string | null {
  const value = textAt(row, keys);
  if (!value) return null;
  return value.slice(0, max);
}

function optionalInt(
  row: Record<string, unknown>,
  keys: string[],
  path: string,
  errors: FieldError[],
): number | null {
  const value = first(row, keys);
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push({ path, message: `${path} phải là số nguyên` });
    return null;
  }
  return value;
}

function optionalNumber(
  row: Record<string, unknown>,
  keys: string[],
  path: string,
  errors: FieldError[],
): number | null {
  const value = first(row, keys);
  if (value == null || value === "") return null;
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push({ path, message: `${path} phải là số` });
    return null;
  }
  return value;
}

function optionalUrl(
  row: Record<string, unknown>,
  keys: string[],
  path: string,
  errors: FieldError[],
): string | null {
  const value = textAt(row, keys);
  if (!value) return null;
  if (!isHttpUrl(value)) {
    errors.push({ path, message: `${path} phải là URL http(s)` });
    return null;
  }
  return value;
}

function requiredUrl(
  row: Record<string, unknown>,
  keys: string[],
  path: string,
  errors: FieldError[],
): string {
  const value = textAt(row, keys);
  if (!value) {
    errors.push({ path, message: `Thiếu ${path}` });
    return "";
  }
  if (!isHttpUrl(value)) {
    errors.push({ path, message: `${path} phải là URL http(s)` });
    return "";
  }
  return value;
}

function optionalInstant(
  row: Record<string, unknown>,
  keys: string[],
  path: string,
  errors: FieldError[],
): string | null {
  const value = first(row, keys);
  if (value == null || value === "") return null;
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push({ path, message: `${path} phải là thời điểm ISO` });
    return null;
  }
  return new Date(value).toISOString();
}

function stringList(raw: unknown, path: string, allowed: Set<string>, errors: FieldError[]): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.push({ path, message: `Thiếu ${path}` });
    return [];
  }
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !allowed.has(item)) {
      errors.push({ path, message: `${path} có giá trị không nằm trong danh sách cho phép` });
      return out;
    }
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
