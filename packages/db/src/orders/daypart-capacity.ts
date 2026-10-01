import { and, eq, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import {
  breakfastPreorderDeliveryWindows,
  breakfastPreorderMenuItems,
} from "../schema/breakfast-preorder.js";

type Tx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

export class DaypartCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DaypartCapacityError";
  }
}

/**
 * Channel cap for a daily-menu slot. Shared catalog stock is reserved separately
 * via reserveOfferingStock. breakfast_* table names cover BREAKFAST and LUNCH.
 */
export async function reserveDaypartMenuCapacity(
  tx: Tx,
  deliveryWindowId: string,
  lineItems: { menuItemId: string; quantity: number; name: string }[],
) {
  const [win] = await tx
    .update(breakfastPreorderDeliveryWindows)
    .set({
      remainingCapacity: sql`${breakfastPreorderDeliveryWindows.remainingCapacity} - 1`,
      status: sql`CASE WHEN ${breakfastPreorderDeliveryWindows.remainingCapacity} - 1 <= 0 THEN 'FULL' ELSE ${breakfastPreorderDeliveryWindows.status} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(breakfastPreorderDeliveryWindows.id, deliveryWindowId),
        eq(breakfastPreorderDeliveryWindows.status, "OPEN"),
        sql`${breakfastPreorderDeliveryWindows.remainingCapacity} >= 1`,
      ),
    )
    .returning();
  if (!win) {
    throw new DaypartCapacityError("Khung giờ giao vừa hết chỗ");
  }

  for (const item of lineItems) {
    const [updated] = await tx
      .update(breakfastPreorderMenuItems)
      .set({
        remainingCapacity: sql`CASE
          WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NULL THEN NULL
          ELSE ${breakfastPreorderMenuItems.remainingCapacity} - ${item.quantity}
        END`,
        status: sql`CASE
          WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NOT NULL
            AND ${breakfastPreorderMenuItems.remainingCapacity} - ${item.quantity} <= 0
          THEN 'SOLD_OUT'
          ELSE ${breakfastPreorderMenuItems.status}
        END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(breakfastPreorderMenuItems.id, item.menuItemId),
          eq(breakfastPreorderMenuItems.status, "ACTIVE"),
          sql`(
            ${breakfastPreorderMenuItems.remainingCapacity} IS NULL
            OR ${breakfastPreorderMenuItems.remainingCapacity} >= ${item.quantity}
          )`,
        ),
      )
      .returning();
    if (!updated) {
      throw new DaypartCapacityError(`Hết suất: ${item.name}`);
    }
  }
}

export async function releaseDaypartMenuCapacity(
  tx: Tx,
  deliveryWindowId: string | null,
  lineItems: { menuItemId: string | null; quantity: number }[],
) {
  if (deliveryWindowId) {
    await tx
      .update(breakfastPreorderDeliveryWindows)
      .set({
        remainingCapacity: sql`${breakfastPreorderDeliveryWindows.remainingCapacity} + 1`,
        status: sql`CASE WHEN ${breakfastPreorderDeliveryWindows.status} = 'FULL' THEN 'OPEN' ELSE ${breakfastPreorderDeliveryWindows.status} END`,
        updatedAt: new Date(),
      })
      .where(eq(breakfastPreorderDeliveryWindows.id, deliveryWindowId));
  }

  for (const line of lineItems) {
    if (!line.menuItemId) continue;
    await tx
      .update(breakfastPreorderMenuItems)
      .set({
        remainingCapacity: sql`CASE
          WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NULL THEN NULL
          ELSE ${breakfastPreorderMenuItems.remainingCapacity} + ${line.quantity}
        END`,
        status: sql`CASE
          WHEN ${breakfastPreorderMenuItems.status} = 'SOLD_OUT' THEN 'ACTIVE'
          ELSE ${breakfastPreorderMenuItems.status}
        END`,
        updatedAt: new Date(),
      })
      .where(eq(breakfastPreorderMenuItems.id, line.menuItemId));
  }
}
