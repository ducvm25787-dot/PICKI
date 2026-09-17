/** Sáng mai ăn gì? — helpers (web không import @picki/db). */

export const BF_DEFAULT_DELIVERY_START = "06:00";
export const BF_DEFAULT_DELIVERY_END = "08:30";
export const BF_SLOT_MINUTES = 15;
export const BF_DEFAULT_SLOT_CAPACITY = 15;

export const BF_DEFAULT_CUTOFF = "23:30";
export const BF_DEFAULT_OPEN_FROM = "20:00";

function parseHm(hhMm: string): number {
  const [h, m] = hhMm.slice(0, 5).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatHm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Chia khung giao 15 phút từ giờ bắt đầu → giờ kết thúc (mặc định 06:00–08:30). */
export function bfGenerateDeliverySlots(
  startHhMm = BF_DEFAULT_DELIVERY_START,
  endHhMm = BF_DEFAULT_DELIVERY_END,
  capacityPerSlot = BF_DEFAULT_SLOT_CAPACITY,
): { startsAt: string; endsAt: string; capacity: number }[] {
  let start = parseHm(startHhMm);
  const end = parseHm(endHhMm);
  if (end <= start) return [];
  // Align start to 15-min grid
  start = Math.ceil(start / BF_SLOT_MINUTES) * BF_SLOT_MINUTES;
  const slots: { startsAt: string; endsAt: string; capacity: number }[] = [];
  for (let t = start; t + BF_SLOT_MINUTES <= end; t += BF_SLOT_MINUTES) {
    slots.push({
      startsAt: formatHm(t),
      endsAt: formatHm(t + BF_SLOT_MINUTES),
      capacity: capacityPerSlot,
    });
  }
  return slots;
}

/** @deprecated use bfGenerateDeliverySlots — kept for callers expecting static defaults */
export const BF_DEFAULT_WINDOWS = bfGenerateDeliverySlots();

function subtractOneCalendarDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** Epoch ms của (serviceDate − 1 ngày) + HH:MM theo Asia/Ho_Chi_Minh. */
export function bfCutoffEpochMs(serviceDate: string, cutoffHhMm: string): number {
  const eveningBefore = subtractOneCalendarDay(serviceDate);
  const hm = cutoffHhMm.slice(0, 5);
  return Date.parse(`${eveningBefore}T${hm}:00+07:00`);
}

export function bfIsPastCutoff(serviceDate: string, cutoffHhMm: string, now = Date.now()): boolean {
  return now >= bfCutoffEpochMs(serviceDate, cutoffHhMm);
}

/** Default service date: trước 12h VN → hôm nay; sau → ngày mai. */
export function defaultBreakfastServiceDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const hour = Number(get("hour"));
  const base = new Date(Date.UTC(y, m - 1, d));
  if (hour >= 12) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

export function formatVnd(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function bfFormatWindowLabel(startsAt?: string | null, endsAt?: string | null): string | null {
  if (!startsAt || !endsAt) return null;
  return `${startsAt.slice(0, 5)}–${endsAt.slice(0, 5)}`;
}
