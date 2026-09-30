import { and, eq, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import {
  offeringStockReservations,
  offerings,
  productDailyAvailability,
} from "../schema/catalog.js";

export type StockTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

export class StockConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StockConflictError";
  }
}

export const STOCK_RELEASE_STATUSES = new Set([
  "CUSTOMER_CANCELLED",
  "SYSTEM_CANCELLED",
  "PROVIDER_REJECTED",
  "PAYMENT_FAILED",
]);

export type TodayOfferView =
  | { visible: false; reason: "HIDDEN" }
  | {
      visible: true;
      amountVnd: number;
      todayStatus: "UNSET" | "AVAILABLE" | "SOLD_OUT";
      remaining: number | null;
    };

/** What the customer may buy today. No daily row means unlimited at the base price. */
export function resolveTodayOffer(input: {
  basePriceVnd: number;
  dayStatus: string | null;
  availableQty: number | null;
  reservedQty: number | null;
  soldQty: number | null;
  priceOverrideVnd: number | null;
}): TodayOfferView {
  const amountVnd = input.priceOverrideVnd ?? input.basePriceVnd;
  if (!input.dayStatus) {
    return { visible: true, amountVnd: input.basePriceVnd, todayStatus: "UNSET", remaining: null };
  }
  if (input.dayStatus === "HIDDEN") return { visible: false, reason: "HIDDEN" };
  if (input.dayStatus === "SOLD_OUT") {
    return { visible: true, amountVnd, todayStatus: "SOLD_OUT", remaining: 0 };
  }
  if (input.availableQty == null) {
    return { visible: true, amountVnd, todayStatus: "UNSET", remaining: null };
  }
  const remaining = input.availableQty - (input.reservedQty ?? 0) - (input.soldQty ?? 0);
  if (remaining <= 0 || input.dayStatus === "SOLD_OUT") {
    return { visible: true, amountVnd, todayStatus: "SOLD_OUT", remaining: 0 };
  }
  return { visible: true, amountVnd, todayStatus: "AVAILABLE", remaining };
}

export function commerceServiceDate(explicit?: string | null, now = new Date()): string {
  if (explicit) return explicit.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

export function groupStockLines(
  lines: { offeringId: string | null; quantity: number; name?: string | null }[],
) {
  const grouped = new Map<string, { quantity: number; name: string }>();
  for (const line of lines) {
    if (!line.offeringId || line.quantity < 1) continue;
    const prev = grouped.get(line.offeringId);
    grouped.set(line.offeringId, {
      quantity: (prev?.quantity ?? 0) + line.quantity,
      name: line.name?.trim() || prev?.name || "Món",
    });
  }
  return grouped;
}

/**
 * Reserve only when a daily row exists and available_qty is set.
 * Missing row or null qty = unlimited, so current menus keep selling.
 */
export async function reserveOfferingStock(
  tx: StockTx,
  input: {
    orderId: string;
    serviceDate: string;
    lines: { offeringId: string | null; quantity: number; name?: string | null }[];
  },
) {
  const serviceDate = commerceServiceDate(input.serviceDate);
  for (const [offeringId, line] of groupStockLines(input.lines)) {
    const [updated] = await tx
      .update(productDailyAvailability)
      .set({
        reservedQty: sql`${productDailyAvailability.reservedQty} + ${line.quantity}`,
        status: sql`CASE
          WHEN ${productDailyAvailability.availableQty} - ${productDailyAvailability.reservedQty} - ${productDailyAvailability.soldQty} - ${line.quantity} <= 0
          THEN 'SOLD_OUT'
          ELSE ${productDailyAvailability.status}
        END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(productDailyAvailability.offeringId, offeringId),
          eq(productDailyAvailability.serviceDate, serviceDate),
          eq(productDailyAvailability.status, "AVAILABLE"),
          sql`${productDailyAvailability.availableQty} IS NOT NULL`,
          sql`${productDailyAvailability.availableQty} - ${productDailyAvailability.reservedQty} - ${productDailyAvailability.soldQty} >= ${line.quantity}`,
        ),
      )
      .returning({ id: productDailyAvailability.id });

    if (updated) {
      const saved = await tx
        .insert(offeringStockReservations)
        .values({
          orderId: input.orderId,
          offeringId,
          serviceDate,
          quantity: line.quantity,
          status: "RESERVED",
        })
        .onConflictDoUpdate({
          target: [offeringStockReservations.orderId, offeringStockReservations.offeringId],
          set: {
            status: "RESERVED",
            quantity: line.quantity,
            serviceDate,
            updatedAt: new Date(),
          },
          setWhere: sql`${offeringStockReservations.status} = 'RELEASED'`,
        })
        .returning({ id: offeringStockReservations.id });
      if (!saved[0]) {
        throw new StockConflictError(`Đơn đã giữ suất: ${line.name}`);
      }
      continue;
    }

    const [existing] = await tx
      .select({
        status: productDailyAvailability.status,
        availableQty: productDailyAvailability.availableQty,
      })
      .from(productDailyAvailability)
      .where(
        and(
          eq(productDailyAvailability.offeringId, offeringId),
          eq(productDailyAvailability.serviceDate, serviceDate),
        ),
      )
      .limit(1);

    if (!existing) continue;
    if (existing.status === "HIDDEN") {
      throw new StockConflictError(`Hôm nay không bán: ${line.name}`);
    }
    if (existing.availableQty == null) continue;
    throw new StockConflictError(`Hết hôm nay: ${line.name}`);
  }
}

export async function confirmOfferingStock(tx: StockTx, orderId: string) {
  await tx.execute(sql`
    UPDATE product_daily_availability AS a
    SET reserved_qty = a.reserved_qty - r.quantity,
        sold_qty = a.sold_qty + r.quantity,
        updated_at = now()
    FROM offering_stock_reservations AS r
    WHERE r.order_id = ${orderId}::uuid
      AND r.status = 'RESERVED'
      AND a.offering_id = r.offering_id
      AND a.service_date = r.service_date
  `);
  await tx
    .update(offeringStockReservations)
    .set({ status: "CONFIRMED", updatedAt: new Date() })
    .where(
      and(
        eq(offeringStockReservations.orderId, orderId),
        eq(offeringStockReservations.status, "RESERVED"),
      ),
    );
}

export async function releaseOfferingStock(tx: StockTx, orderId: string) {
  await tx.execute(sql`
    UPDATE product_daily_availability AS a
    SET
      reserved_qty = CASE
        WHEN r.status = 'RESERVED' THEN a.reserved_qty - r.quantity
        ELSE a.reserved_qty
      END,
      sold_qty = CASE
        WHEN r.status = 'CONFIRMED' THEN GREATEST(a.sold_qty - r.quantity, 0)
        ELSE a.sold_qty
      END,
      status = CASE
        WHEN a.status = 'SOLD_OUT'
          AND a.available_qty IS NOT NULL
          AND (
            a.available_qty
            - (CASE WHEN r.status = 'RESERVED' THEN a.reserved_qty - r.quantity ELSE a.reserved_qty END)
            - (CASE WHEN r.status = 'CONFIRMED' THEN GREATEST(a.sold_qty - r.quantity, 0) ELSE a.sold_qty END)
          ) > 0
        THEN 'AVAILABLE'
        ELSE a.status
      END,
      updated_at = now()
    FROM offering_stock_reservations AS r
    WHERE r.order_id = ${orderId}::uuid
      AND r.status IN ('RESERVED', 'CONFIRMED')
      AND a.offering_id = r.offering_id
      AND a.service_date = r.service_date
  `);
  await tx
    .update(offeringStockReservations)
    .set({ status: "RELEASED", updatedAt: new Date() })
    .where(
      and(
        eq(offeringStockReservations.orderId, orderId),
        sql`${offeringStockReservations.status} IN ('RESERVED', 'CONFIRMED')`,
      ),
    );
}

/** SOLD_OUT with remaining qty becomes AVAILABLE. A hidden row stays hidden until the shop shows it again. */
export async function addDailySellableQty(
  tx: StockTx,
  input: { offeringId: string; serviceDate: string; quantity: number },
) {
  if (input.quantity < 1) {
    throw new Error("quantity must be positive");
  }
  const serviceDate = commerceServiceDate(input.serviceDate);
  const [offering] = await tx
    .select({ providerId: offerings.providerId })
    .from(offerings)
    .where(eq(offerings.id, input.offeringId))
    .limit(1);
  if (!offering) {
    throw new Error("offering missing");
  }

  await tx.execute(sql`
    INSERT INTO product_daily_availability (
      provider_id, offering_id, service_date, status, available_qty, reserved_qty, sold_qty
    ) VALUES (
      ${offering.providerId}::uuid,
      ${input.offeringId}::uuid,
      ${serviceDate}::date,
      'AVAILABLE',
      ${input.quantity},
      0,
      0
    )
    ON CONFLICT (offering_id, service_date) DO UPDATE
    SET available_qty = COALESCE(product_daily_availability.available_qty, 0) + ${input.quantity},
        status = CASE
          WHEN product_daily_availability.status = 'HIDDEN' THEN 'HIDDEN'
          WHEN COALESCE(product_daily_availability.available_qty, 0) + ${input.quantity}
               - product_daily_availability.reserved_qty
               - product_daily_availability.sold_qty > 0
          THEN 'AVAILABLE'
          ELSE product_daily_availability.status
        END,
        updated_at = now()
  `);
}

export async function applyDailyStockAction(
  tx: StockTx,
  input: {
    offeringId: string;
    serviceDate: string;
    action: "add" | "sold_out" | "hide" | "show";
    quantity?: number;
  },
) {
  const serviceDate = commerceServiceDate(input.serviceDate);
  if (input.action === "add") {
    const [before] = await tx
      .select({ status: productDailyAvailability.status })
      .from(productDailyAvailability)
      .where(
        and(
          eq(productDailyAvailability.offeringId, input.offeringId),
          eq(productDailyAvailability.serviceDate, serviceDate),
        ),
      )
      .limit(1);
    await addDailySellableQty(tx, {
      offeringId: input.offeringId,
      serviceDate,
      quantity: input.quantity ?? 1,
    });
    if (before?.status === "HIDDEN") {
      await applyDailyStockAction(tx, { ...input, action: "show" });
    }
    return;
  }

  const [offering] = await tx
    .select({ providerId: offerings.providerId })
    .from(offerings)
    .where(eq(offerings.id, input.offeringId))
    .limit(1);
  if (!offering) throw new Error("offering missing");

  const [row] = await tx
    .select()
    .from(productDailyAvailability)
    .where(
      and(
        eq(productDailyAvailability.offeringId, input.offeringId),
        eq(productDailyAvailability.serviceDate, serviceDate),
      ),
    )
    .limit(1);

  if (input.action === "sold_out") {
    const reserved = row?.reservedQty ?? 0;
    const sold = row?.soldQty ?? 0;
    if (!row) {
      await tx.insert(productDailyAvailability).values({
        providerId: offering.providerId,
        offeringId: input.offeringId,
        serviceDate,
        status: "SOLD_OUT",
        availableQty: 0,
      });
      return;
    }
    await tx
      .update(productDailyAvailability)
      .set({ availableQty: reserved + sold, status: "SOLD_OUT", updatedAt: new Date() })
      .where(eq(productDailyAvailability.id, row.id));
    return;
  }

  if (input.action === "hide") {
    if (!row) {
      await tx.insert(productDailyAvailability).values({
        providerId: offering.providerId,
        offeringId: input.offeringId,
        serviceDate,
        status: "HIDDEN",
        availableQty: null,
      });
      return;
    }
    await tx
      .update(productDailyAvailability)
      .set({ status: "HIDDEN", updatedAt: new Date() })
      .where(eq(productDailyAvailability.id, row.id));
    return;
  }

  if (!row || row.status !== "HIDDEN") return;
  const remaining =
    row.availableQty == null ? null : row.availableQty - row.reservedQty - row.soldQty;
  await tx
    .update(productDailyAvailability)
    .set({
      status: remaining != null && remaining <= 0 ? "SOLD_OUT" : "AVAILABLE",
      updatedAt: new Date(),
    })
    .where(eq(productDailyAvailability.id, row.id));
}

/** Copy the latest earlier day onto today. Existing rows for today are left as the shop set them. */
export async function copyPreviousDailyAvailability(
  tx: StockTx,
  providerId: string,
  today: string,
) {
  const serviceDate = commerceServiceDate(today);
  const [source] = await tx
    .select({ serviceDate: productDailyAvailability.serviceDate })
    .from(productDailyAvailability)
    .where(
      and(
        eq(productDailyAvailability.providerId, providerId),
        sql`${productDailyAvailability.serviceDate} < ${serviceDate}::date`,
      ),
    )
    .orderBy(sql`${productDailyAvailability.serviceDate} DESC`)
    .limit(1);
  if (!source) return { sourceDate: null as string | null, copied: 0 };

  const [before] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(productDailyAvailability)
    .where(
      and(
        eq(productDailyAvailability.providerId, providerId),
        eq(productDailyAvailability.serviceDate, serviceDate),
      ),
    );
  await tx.execute(sql`
    INSERT INTO product_daily_availability (
      provider_id, offering_id, service_date, status, available_qty,
      reserved_qty, sold_qty, price_override_vnd, available_from, available_until
    )
    SELECT
      provider_id,
      offering_id,
      ${serviceDate}::date,
      CASE
        WHEN status = 'HIDDEN' THEN 'HIDDEN'
        WHEN available_qty IS NOT NULL AND available_qty <= 0 THEN 'SOLD_OUT'
        ELSE 'AVAILABLE'
      END,
      available_qty,
      0,
      0,
      price_override_vnd,
      available_from,
      available_until
    FROM product_daily_availability
    WHERE provider_id = ${providerId}::uuid
      AND service_date = ${source.serviceDate}::date
    ON CONFLICT (offering_id, service_date) DO NOTHING
  `);
  const [after] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(productDailyAvailability)
    .where(
      and(
        eq(productDailyAvailability.providerId, providerId),
        eq(productDailyAvailability.serviceDate, serviceDate),
      ),
    );
  return {
    sourceDate: source.serviceDate,
    copied: Number(after?.n ?? 0) - Number(before?.n ?? 0),
  };
}

/** Today's price only. Does not create a quantity limit and does not unhide the dish. */
export async function setDailyPrice(
  tx: StockTx,
  input: { offeringId: string; serviceDate: string; priceVnd: number | null },
) {
  const serviceDate = commerceServiceDate(input.serviceDate);
  const [offering] = await tx
    .select({ providerId: offerings.providerId })
    .from(offerings)
    .where(eq(offerings.id, input.offeringId))
    .limit(1);
  if (!offering) throw new Error("offering missing");

  const [row] = await tx
    .select({ id: productDailyAvailability.id })
    .from(productDailyAvailability)
    .where(
      and(
        eq(productDailyAvailability.offeringId, input.offeringId),
        eq(productDailyAvailability.serviceDate, serviceDate),
      ),
    )
    .limit(1);

  if (!row) {
    if (input.priceVnd == null) return;
    await tx.insert(productDailyAvailability).values({
      providerId: offering.providerId,
      offeringId: input.offeringId,
      serviceDate,
      status: "AVAILABLE",
      availableQty: null,
      priceOverrideVnd: input.priceVnd,
    });
    return;
  }

  await tx
    .update(productDailyAvailability)
    .set({ priceOverrideVnd: input.priceVnd, updatedAt: new Date() })
    .where(eq(productDailyAvailability.id, row.id));
}
