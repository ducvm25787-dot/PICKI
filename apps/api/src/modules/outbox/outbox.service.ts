import { Inject, Injectable } from "@nestjs/common";
import { outboxEvents, type PickiDb } from "@picki/db";
import { PICKI_DB } from "../../shared/tokens.js";

export type OutboxPayload = Record<string, unknown>;

export type OutboxEventInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: OutboxPayload;
};

type DbExecutor = Pick<PickiDb, "insert">;

@Injectable()
export class OutboxService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async enqueue(tx: DbExecutor, event: OutboxEventInput): Promise<void> {
    await tx.insert(outboxEvents).values({
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      status: "PENDING",
    });
  }

  enqueueOrderStatusChanged(
    tx: DbExecutor,
    order: {
      id: string;
      orderNumber: string;
      customerUserId: string;
      providerLocationId: string;
      zoneId: string;
      runnerUserId: string | null;
    },
    fromStatus: string | null,
    toStatus: string,
  ): Promise<void> {
    return this.enqueue(tx, {
      eventType: "order.status_changed",
      aggregateType: "order",
      aggregateId: order.id,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerUserId: order.customerUserId,
        providerLocationId: order.providerLocationId,
        zoneId: order.zoneId,
        runnerUserId: order.runnerUserId,
        fromStatus,
        toStatus,
      },
    });
  }
}
