import { eq } from "drizzle-orm";
import { isDaypartMenuOrder } from "@picki/shared";
import {
  breakfastPreorderDeliveryWindows,
  familyDinnerDeliveryWindows,
} from "../schema/index.js";
import type { PickiDb } from "../client.js";

export type OrderDeliveryWindowSnap = {
  startsAt: string;
  endsAt: string;
  /** e.g. "06:15–06:30" */
  label: string;
};

function hhMm(value: string | unknown): string {
  if (typeof value !== "string") return "00:00";
  return value.slice(0, 5);
}

/** Load delivery window snapshot for Family Dinner or Breakfast Preorder. */
export async function loadOrderDeliveryWindow(
  db: PickiDb,
  order: {
    orderKind?: string | null;
    deliveryWindowId?: string | null;
    breakfastDeliveryWindowId?: string | null;
  },
): Promise<OrderDeliveryWindowSnap | null> {
  if (isDaypartMenuOrder(order.orderKind) && order.breakfastDeliveryWindowId) {
    const rows = await db
      .select({
        startsAt: breakfastPreorderDeliveryWindows.startsAt,
        endsAt: breakfastPreorderDeliveryWindows.endsAt,
      })
      .from(breakfastPreorderDeliveryWindows)
      .where(eq(breakfastPreorderDeliveryWindows.id, order.breakfastDeliveryWindowId))
      .limit(1);
    const w = rows[0];
    if (!w) return null;
    const startsAt = hhMm(w.startsAt);
    const endsAt = hhMm(w.endsAt);
    return { startsAt, endsAt, label: `${startsAt}–${endsAt}` };
  }

  if (
    (order.orderKind === "FAMILY_DINNER" || order.orderKind === "LATE_DINNER") &&
    order.deliveryWindowId
  ) {
    const rows = await db
      .select({
        startsAt: familyDinnerDeliveryWindows.startsAt,
        endsAt: familyDinnerDeliveryWindows.endsAt,
      })
      .from(familyDinnerDeliveryWindows)
      .where(eq(familyDinnerDeliveryWindows.id, order.deliveryWindowId))
      .limit(1);
    const w = rows[0];
    if (!w) return null;
    const startsAt = hhMm(w.startsAt);
    const endsAt = hhMm(w.endsAt);
    return { startsAt, endsAt, label: `${startsAt}–${endsAt}` };
  }

  // Fallback: any window id present
  if (order.breakfastDeliveryWindowId) {
    return loadOrderDeliveryWindow(db, {
      orderKind: "BREAKFAST_PREORDER",
      breakfastDeliveryWindowId: order.breakfastDeliveryWindowId,
    });
  }
  if (order.deliveryWindowId) {
    return loadOrderDeliveryWindow(db, {
      orderKind: "FAMILY_DINNER",
      deliveryWindowId: order.deliveryWindowId,
    });
  }
  return null;
}
