import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import {
  calculateProviderRunnerFeeVnd,
  createRunnerOffers,
  notifications,
  orders,
  selectRunnerOfferCandidates,
  supersedePendingOffers,
  zoneFulfillmentSettings,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB } from "../../shared/tokens.js";

export type RunnerDispatchLeg = "INBOUND" | "RETURN";

@Injectable()
export class RunnerDispatchService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async loadZoneFees(zoneId: string) {
    const row = await this.db
      .select()
      .from(zoneFulfillmentSettings)
      .where(eq(zoneFulfillmentSettings.zoneId, zoneId))
      .limit(1);
    return row[0] ?? null;
  }

  runnerFeeVnd(
    order: typeof orders.$inferSelect,
    leg: RunnerDispatchLeg,
    zoneRow: Awaited<ReturnType<RunnerDispatchService["loadZoneFees"]>>,
  ) {
    return calculateProviderRunnerFeeVnd({
      serviceVertical: order.serviceVertical as "FOOD" | "LAUNDRY",
      leg,
      handoffMode: order.deliveryHandoffMode as "LOBBY_PICKUP" | "DOOR_DELIVERY",
      zoneSettings: zoneRow
        ? {
            foodDeliveryFeeVnd: zoneRow.foodDeliveryFeeVnd,
            foodDoorDeliveryFeeVnd: zoneRow.foodDoorDeliveryFeeVnd,
            laundryReturnRunnerFeeVnd: zoneRow.laundryReturnRunnerFeeVnd,
          }
        : null,
      orderDeliveryFeeVnd: order.deliveryFeeVnd,
    });
  }

  async dispatch(
    order: typeof orders.$inferSelect,
    leg: RunnerDispatchLeg,
    actorUserId?: string | null,
  ) {
    const zoneRow = await this.loadZoneFees(order.zoneId);
    const runnerFeeVnd = this.runnerFeeVnd(order, leg, zoneRow);
    const wave = (order.runnerOfferWave ?? 0) + 1;

    const candidates = await selectRunnerOfferCandidates(this.db, order.zoneId, order.id);
    if (candidates.length === 0) {
      throw new PickiError(
        "FORBIDDEN",
        "Không còn runner khả dụng — thử lại sau hoặc tự giao",
      );
    }

    await this.db.transaction(async (tx) => {
      await supersedePendingOffers(tx, order.id);

      await tx
        .update(notifications)
        .set({ supersededAt: new Date() })
        .where(
          sql`${notifications.eventType} = 'order.seeking_runner' AND ${notifications.payload}->>'orderId' = ${order.id} AND ${notifications.supersededAt} IS NULL`,
        );

      await createRunnerOffers(tx, order.id, wave, candidates);

      const patch: Partial<typeof orders.$inferInsert> = {
        runnerUserId: null,
        runnerSoughtAt: new Date(),
        runnerOfferWave: wave,
        updatedAt: new Date(),
      };
      if (order.serviceVertical === "LAUNDRY" && leg === "RETURN") {
        patch.deliveryFeeVnd = runnerFeeVnd;
      }

      await tx.update(orders).set(patch).where(eq(orders.id, order.id));

      await this.outbox.enqueue(tx, {
        eventType: "order.seeking_runner",
        aggregateType: "order",
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerUserId: order.customerUserId,
          providerLocationId: order.providerLocationId,
          zoneId: order.zoneId,
          leg,
          wave,
          runnerUserIds: candidates,
          deliveryFeeVnd: runnerFeeVnd,
          actorUserId: actorUserId ?? null,
        },
      });
    });

    return { wave, runnerFeeVnd, runnerCount: candidates.length };
  }

  /** Supersede pending offers and clear runner search (e.g. provider self-delivers). */
  async cancelDispatch(
    orderId: string,
    options?: { clearLaundryReturnFee?: boolean },
  ) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) return;

    await this.db.transaction(async (tx) => {
      await supersedePendingOffers(tx, orderId);

      await tx
        .update(notifications)
        .set({ supersededAt: new Date() })
        .where(
          sql`${notifications.eventType} = 'order.seeking_runner' AND ${notifications.payload}->>'orderId' = ${orderId} AND ${notifications.supersededAt} IS NULL`,
        );

      const patch: Partial<typeof orders.$inferInsert> = {
        runnerUserId: null,
        runnerSoughtAt: null,
        updatedAt: new Date(),
      };
      if (options?.clearLaundryReturnFee && order.serviceVertical === "LAUNDRY") {
        patch.deliveryFeeVnd = 0;
      }

      await tx.update(orders).set(patch).where(eq(orders.id, orderId));
    });
  }
}
