import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  canAdminSystemCancel,
  canTransition,
  orderItems,
  orders,
  orderStatusHistory,
  upsertRelationshipFromOrders,
  confirmOfferingStock,
  releaseOfferingStock,
  STOCK_RELEASE_STATUSES,
  type PickiDb,
  type PickiSql,
  type LaundryPickupMode,
  type ServiceVertical,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";

@Injectable()
export class OrderTransitionService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async adminTransition(
    orderId: string,
    toStatus: string,
    actorUserId: string,
    note?: string,
  ) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    if (toStatus === "SYSTEM_CANCELLED") {
      if (!canAdminSystemCancel(order.status)) {
        throw new PickiError("FORBIDDEN", `Cannot cancel order in status ${order.status}`);
      }
    } else if (
      !canTransition(
        order.status,
        toStatus,
        order.serviceVertical as ServiceVertical,
        order.laundryPickupMode as LaundryPickupMode | null,
        order.orderKind,
        order.fulfillmentMode,
      )
    ) {
      throw new PickiError("FORBIDDEN", `Cannot transition ${order.status} → ${toStatus}`);
    }

    return this.applyTransition(order, toStatus, actorUserId, note);
  }

  async transition(
    orderId: string,
    toStatus: string,
    actorUserId: string,
    note?: string,
    extra?: { runnerUserId?: string; cancelReason?: string | null },
  ) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    if (
      !canTransition(
        order.status,
        toStatus,
        order.serviceVertical as ServiceVertical,
        order.laundryPickupMode as LaundryPickupMode | null,
        order.orderKind,
        order.fulfillmentMode,
      )
    ) {
      throw new PickiError("FORBIDDEN", `Cannot transition ${order.status} → ${toStatus}`);
    }

    return this.applyTransition(order, toStatus, actorUserId, note, extra);
  }

  private async applyTransition(
    order: typeof orders.$inferSelect,
    toStatus: string,
    actorUserId: string,
    note?: string,
    extra?: { runnerUserId?: string; cancelReason?: string | null },
  ) {
    const orderId = order.id;

    const result = await this.db.transaction(async (tx) => {
      const patch: Partial<typeof orders.$inferInsert> = {
        status: toStatus,
        updatedAt: new Date(),
      };
      if (extra?.runnerUserId) {
        patch.runnerUserId = extra.runnerUserId;
      }
      if (toStatus === "PROVIDER_REJECTED") {
        patch.cancelReason = extra?.cancelReason?.trim() || null;
      }

      const [updated] = await tx
        .update(orders)
        .set(patch)
        .where(eq(orders.id, orderId))
        .returning();

      if (!updated) {
        throw new PickiError("INTERNAL_ERROR", "Failed to update order");
      }

      await tx.insert(orderStatusHistory).values({
        orderId,
        fromStatus: order.status,
        toStatus,
        actorUserId,
        note: note ?? null,
      });

      await this.outbox.enqueueOrderStatusChanged(tx, updated, order.status, toStatus, actorUserId);

      if (toStatus === "PROVIDER_ACCEPTED") {
        await confirmOfferingStock(tx, orderId);
      }
      if (STOCK_RELEASE_STATUSES.has(toStatus)) {
        await releaseOfferingStock(tx, orderId);
      }

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      return { order: updated, items };
    });

    if (toStatus === "DELIVERED" || toStatus === "COMPLETED") {
      try {
        await upsertRelationshipFromOrders(
          this.sql,
          result.order.customerUserId,
          result.order.providerLocationId,
        );
      } catch (err) {
        console.error("relationship upsert failed", err);
      }
    }

    return result;
  }
}

