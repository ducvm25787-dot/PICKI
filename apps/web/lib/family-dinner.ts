/** Gợi ý món — mirror packages/db family-dinner rules (web không import @picki/db). */
export const FD_SUGGESTIONS = {
  MAIN: [
    "Thịt rang cháy cạnh",
    "Cá trắm kho riềng",
    "Gà rang gừng",
    "Sườn xào chua ngọt",
    "Cá sốt cà chua",
    "Bò xào cần tỏi",
    "Thịt kho trứng",
    "Gà om nấm",
    "Tôm rang thịt",
    "Thịt viên sốt cà",
  ],
  SIDE: [
    "Đậu phụ tẩm hành",
    "Trứng rán hành",
    "Đậu phụ sốt cà",
    "Trứng hấp thịt",
    "Khoai tây xào bơ tỏi / chiên",
    "Nem rán",
    "Lạc rang muối",
  ],
  VEGETABLE: [
    "Rau muống luộc",
    "Cải xào",
    "Rau củ luộc chấm muối lạc",
    "Cà muối",
    "Dưa muối",
  ],
  SOUP: [
    "Canh cua mồng tơi mướp",
    "Canh bí đỏ thịt băm",
    "Canh rau ngót thịt băm",
    "Canh ngao nấu chua",
    "Canh rau củ ninh xương",
  ],
  RICE: ["Cơm trắng", "Cơm gạo lứt", "Cơm nắm"],
} as const;

export const FD_DEFAULT_PRICE = {
  MAIN: 109_000,
  SIDE: 39_000,
  VEGETABLE: 29_000,
  SOUP: 69_000,
  RICE: 15_000,
  EXTRA: 19_000,
} as const;

export const FD_CATEGORY_LABEL = {
  MAIN: "Món chính",
  SIDE: "Món phụ",
  VEGETABLE: "Rau",
  SOUP: "Canh",
  RICE: "Cơm",
  EXTRA: "Thêm",
} as const;

/** Số ô mặc định / khuyến nghị khi mở form. */
export const FD_DEFAULT_SLOTS = {
  MAIN: 5,
  SIDE: 5,
  VEGETABLE: 3,
  SOUP: 3,
  RICE: 2,
} as const;

export const FD_MAX_SLOTS = {
  MAIN: 10,
  SIDE: 10,
  VEGETABLE: 5,
  SOUP: 5,
  RICE: 5,
} as const;

export const FD_CATEGORY_ORDER = ["MAIN", "SIDE", "VEGETABLE", "SOUP", "RICE"] as const;

/** Nhóm bắt buộc trên menu bếp (khách có thể bỏ Cơm khi đặt = tự nấu). */
export const FD_MENU_REQUIRED = ["MAIN", "SIDE", "VEGETABLE", "SOUP", "RICE"] as const;

/** Nhóm được tick Cho phép tự nấu (mirror @picki/db). */
export const FD_SELF_COOK_CATEGORIES = ["MAIN", "SIDE", "VEGETABLE", "SOUP"] as const;

export type FdPrepMode = "READY_COOKED" | "SELF_COOK";

export function fdAllowsSelfCookCategory(category: string): boolean {
  return (FD_SELF_COOK_CATEGORIES as readonly string[]).includes(category);
}

/** Phụ thu mỗi suất cơm thêm sau suất đầu. */
export const FD_RICE_EXTRA_PORTION_VND = 5_000;

export function fdRiceLineTotalVnd(basePriceVnd: number, quantity: number): number {
  const q = Math.max(0, Math.floor(quantity));
  if (q <= 0) return 0;
  return basePriceVnd + (q - 1) * FD_RICE_EXTRA_PORTION_VND;
}

/** Hiển thị dòng cơm: «Cơm trắng ×1 + 1 suất» thay vì «× 2». */
export function fdFormatItemQtyLabel(
  name: string,
  quantity: number,
  opts?: { category?: string | null },
): string {
  const q = Math.max(0, Math.floor(quantity));
  if (opts?.category === "RICE" && q > 1) {
    const extra = q - 1;
    return `${name} ×1 + ${extra} suất`;
  }
  return `${name} × ${q}`;
}

export type FdRequiredCategory = keyof typeof FD_SUGGESTIONS;

/** Epoch ms của serviceDate + HH:MM theo Asia/Ho_Chi_Minh. */
export function fdCutoffEpochMs(serviceDate: string, cutoffHhMm: string): number {
  const hm = cutoffHhMm.slice(0, 5);
  return Date.parse(`${serviceDate}T${hm}:00+07:00`);
}

/** Bắt đầu cửa sổ nhận đơn: 06:00 VN ngày phục vụ (hoặc publishedAt nếu muộn hơn). */
export function fdReceivingStartEpochMs(
  serviceDate: string,
  publishedAtIso?: string | null,
): number {
  const morning = Date.parse(`${serviceDate}T06:00:00+07:00`);
  if (publishedAtIso) {
    const pub = Date.parse(publishedAtIso);
    if (!Number.isNaN(pub) && pub > morning) return pub;
  }
  return morning;
}

export function fdIsPastCutoff(serviceDate: string, cutoffHhMm: string, now = Date.now()): boolean {
  return now >= fdCutoffEpochMs(serviceDate, cutoffHhMm);
}

export function fdFormatRemaining(ms: number): string {
  if (ms <= 0) return "0 phút";
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (hours > 0) {
    return min > 0 ? `${String(hours)} giờ ${String(min)} phút` : `${String(hours)} giờ`;
  }
  if (min <= 0) return `${String(sec)} giây`;
  if (sec === 0) return `${String(min)} phút`;
  return `${String(min)} phút ${String(sec)} giây`;
}

/** Kế hoạch nấu: tách phần bếp nấu sẵn vs khách tự nấu. */
export function fdFormatCookPlanQty(confirmed: number, selfCook: number): string {
  const total = Math.max(0, Math.floor(confirmed));
  const sc = Math.max(0, Math.min(total, Math.floor(selfCook)));
  const ready = total - sc;
  if (sc > 0) return `nấu sẵn ${ready} · tự nấu ${sc}`;
  return String(total);
}

/** Max suất mâm muộn theo remaining / qtyPerTray (mặc định 1). */
export function fdLateMaxCapacity(
  lines: { remainingQuantity: number; quantityPerTray?: number }[],
): number {
  if (lines.length === 0) return 0;
  let max = Infinity;
  for (const line of lines) {
    const per = Math.max(1, line.quantityPerTray ?? 1);
    max = Math.min(max, Math.floor(line.remainingQuantity / per));
  }
  return Number.isFinite(max) ? Math.max(0, max) : 0;
}
