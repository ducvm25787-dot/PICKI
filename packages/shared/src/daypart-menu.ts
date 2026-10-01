/**
 * Daily menu engine shared by Sáng mai / Ăn sáng and Bữa trưa vui vẻ.
 * Not Family Dinner. Not a second commerce model.
 *
 * orders.breakfast_menu_item_id and orders.breakfast_delivery_window_id keep
 * their column names. They store the menu line and slot for both dayparts.
 */

export const DAYPART_MENU_ORDER_KINDS = ["BREAKFAST_PREORDER", "LUNCH"] as const;
export type DaypartMenuOrderKind = (typeof DAYPART_MENU_ORDER_KINDS)[number];

export const FOOD_DAYPARTS = ["BREAKFAST", "LUNCH"] as const;
export type FoodDaypart = (typeof FOOD_DAYPARTS)[number];

export const BREAKFAST_MORNING_START = "06:00";
export const BREAKFAST_MORNING_END = "09:00";
export const LUNCH_SELL_START = "09:00";
export const LUNCH_SELL_END = "13:00";

export function isDaypartMenuOrder(
  orderKind: string | null | undefined,
): orderKind is DaypartMenuOrderKind {
  return orderKind === "BREAKFAST_PREORDER" || orderKind === "LUNCH";
}

export function foodDaypartForOrderKind(orderKind: string | null | undefined): FoodDaypart {
  return orderKind === "LUNCH" ? "LUNCH" : "BREAKFAST";
}

export function isFoodDaypart(value: string | null | undefined): value is FoodDaypart {
  return value === "BREAKFAST" || value === "LUNCH";
}

type VnClock = { date: string; hm: string };

export function vnClock(now = new Date()): VnClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hm: `${hour}:${get("minute")}`,
  };
}

function previousDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

export type BreakfastSellPhase = "PREORDER" | "MORNING" | "CLOSED";

/**
 * PREORDER: evening before service_date, from openFrom until cutoff.
 * MORNING: 06:00–09:00 on service_date, same menu, remaining stock.
 */
export function breakfastSellPhase(
  serviceDate: string,
  openFromHhMm: string,
  cutoffHhMm: string,
  now = new Date(),
): BreakfastSellPhase {
  const clock = vnClock(now);
  const openFrom = openFromHhMm.slice(0, 5);
  const cutoff = cutoffHhMm.slice(0, 5);
  const evening = previousDate(serviceDate);
  if (clock.date === evening && clock.hm >= openFrom && clock.hm < cutoff) {
    return "PREORDER";
  }
  if (
    clock.date === serviceDate &&
    clock.hm >= BREAKFAST_MORNING_START &&
    clock.hm < BREAKFAST_MORNING_END
  ) {
    return "MORNING";
  }
  return "CLOSED";
}

export function isLunchSellOpen(serviceDate: string, now = new Date()): boolean {
  const clock = vnClock(now);
  return (
    clock.date === serviceDate &&
    clock.hm >= LUNCH_SELL_START &&
    clock.hm < LUNCH_SELL_END
  );
}
