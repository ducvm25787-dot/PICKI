import { formatVnd } from "./money";

export const AUDIENCE_LABELS: Record<string, string> = {
  FAMILY: "Gia đình",
  COUPLE: "Cặp đôi",
  KIDS: "Trẻ em",
  FRIENDS: "Bạn bè",
  SOLO: "Một mình",
};

export const CATEGORY_LABELS: Record<string, string> = {
  culture: "Văn hóa",
  art: "Nghệ thuật",
  music: "Âm nhạc",
  show: "Biểu diễn",
  exhibition: "Triển lãm",
  fair: "Hội chợ",
  festival: "Lễ hội",
  sport: "Thể thao",
  running: "Chạy bộ",
  outdoor: "Ngoài trời",
  workshop: "Workshop",
  food: "Ẩm thực",
  kids: "Trẻ em",
  free: "Miễn phí",
};

export type ExperienceCityRef = { code: string; label: string; slug: string };

export function experienceApi(citySlug: string, path = "") {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/cities/${citySlug}/experiences${suffix}`;
}

export function experienceHref(citySlug: string, path = "") {
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : "";
  return `/${citySlug}/experiences${suffix}`;
}

export type ExperienceCard = {
  id: string;
  city?: ExperienceCityRef;
  title: string;
  summary: string;
  whyGo: string;
  status: string;
  priceMode: "FREE" | "PRICED" | "UNKNOWN";
  priceFromVnd: number | null;
  priceToVnd: number | null;
  priceNote: string | null;
  ageNote: string | null;
  language: string | null;
  durationMinutes: number | null;
  categories: string[];
  audiences: string[];
  bookingUrl: string | null;
  coverUrl: string | null;
  mediaStatus: string;
  soldOut: boolean;
  featuredRank: number | null;
  bookingDeadline?: string | null;
  registrationDeadline?: string | null;
  venue: { name: string; address: string | null; lat?: number | null; lng?: number | null };
  organizer: { id?: string; name: string; websiteUrl?: string | null };
  occurrences: { startAt: string; endAt: string | null }[];
  saved?: boolean;
  interested?: boolean;
  body?: string | null;
  imageUrls?: string[];
  bodyBlocks?: BodyBlock[];
  sources?: { sourceUrl: string; sourceName: string; sourceType: string }[];
};

export type BodyBlock = {
  type: "heading" | "paragraph" | "bullet";
  inlines: (
    | { kind: "text"; text: string }
    | { kind: "bold"; text: string }
    | { kind: "italic"; text: string }
    | { kind: "link"; text: string; href: string }
  )[];
};

export function priceLabel(card: Pick<ExperienceCard, "priceMode" | "priceFromVnd" | "priceToVnd">): string {
  if (card.priceMode === "FREE") return "Miễn phí";
  if (card.priceMode === "UNKNOWN" || card.priceFromVnd == null) return "Giá chưa rõ";
  if (card.priceToVnd != null && card.priceToVnd !== card.priceFromVnd) {
    return `${formatVnd(card.priceFromVnd)} – ${formatVnd(card.priceToVnd)}`;
  }
  return `Từ ${formatVnd(card.priceFromVnd)}`;
}

export function audienceLine(audiences: string[]): string {
  return audiences.map((item) => AUDIENCE_LABELS[item] ?? item).join(" · ");
}

export function ictInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour === "24" ? "00" : hour}:${get("minute")}`;
}

export function ictInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value.length === 16 ? `${value}:00` : value}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatOccurrence(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
