import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import {
  orderItems,
  orders,
  runnerActionToStatus,
  runnerPresence,
  runners,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import { FulfillmentService } from "../fulfillment/fulfillment.service.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import type { z } from "zod";
import type { runnerOrderActionSchema, updatePresenceSchema } from "./dto.js";

@Injectable()
export class RunnerService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(FulfillmentService) private readonly fulfillment: FulfillmentService,
  ) {}

  async getProfile(userId: string) {
    const row = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!row[0]) {
      throw new PickiError("FORBIDDEN", "Runner profile not found");
    }
    const presence = await this.db
      .select()
      .from(runnerPresence)
      .where(eq(runnerPresence.runnerId, row[0].id))
      .limit(1);
    return {
      runnerId: row[0].id,
      zoneId: row[0].zoneId,
      presence: presence[0]?.status ?? "OFFLINE",
    };
  }

  async updatePresence(userId: string, input: z.infer<typeof updatePresenceSchema>) {
    const runner = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!runner[0]) {
      throw new PickiError("FORBIDDEN", "Runner profile not found");
    }

    await this.db
      .insert(runnerPresence)
      .values({
        runnerId: runner[0].id,
        status: input.status,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: runnerPresence.runnerId,
        set: { status: input.status, updatedAt: new Date() },
      });

    return { status: input.status };
  }

  async listOrders(userId: string) {
    const runner = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!runner[0]) {
      throw new PickiError("FORBIDDEN", "Runner profile not found");
    }

    const terminal = ["DELIVERED", "CUSTOMER_CANCELLED", "SYSTEM_CANCELLED", "PROVIDER_REJECTED"];

    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.zoneId, runner[0].zoneId),
          or(
            and(eq(orders.status, "PROVIDER_ACCEPTED"), isNull(orders.runnerUserId)),
            and(eq(orders.runnerUserId, userId), notInArray(orders.status, terminal)),
          ),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const mapOrder = async (o: (typeof rows)[0]) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      totalVnd: o.totalVnd,
      assignedToMe: o.runnerUserId === userId,
      estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
      providerHandoffAt: o.providerHandoffAt?.toISOString() ?? null,
      delivery: {
        building: o.deliveryBuilding,
        apartment: o.deliveryApartment,
      },
      items: await this.db.select().from(orderItems).where(eq(orderItems.orderId, o.id)),
    });

    const pool = rows.filter((o) => !o.runnerUserId && o.status === "PROVIDER_ACCEPTED");
    const mine = rows.filter((o) => o.runnerUserId === userId);

    return {
      orders: await Promise.all(rows.map(mapOrder)),
      pool: await Promise.all(pool.map(mapOrder)),
      mine: await Promise.all(mine.map(mapOrder)),
    };
  }

  async applyOrderAction(
    userId: string,
    orderId: string,
    input: z.infer<typeof runnerOrderActionSchema>,
  ) {
    const runner = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!runner[0]) {
      throw new PickiError("FORBIDDEN", "Runner profile not found");
    }

    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0] || order[0].zoneId !== runner[0].zoneId) {
      throw new PickiError("NOT_FOUND", "Order not found in your zone");
    }

    const toStatus = runnerActionToStatus(input.action);

    if (input.action === "accept") {
      if (order[0].status !== "PROVIDER_ACCEPTED") {
        throw new PickiError("FORBIDDEN", "Quán phải nhận đơn trước — runner chỉ nhận khi đang tìm runner");
      }
      if (order[0].runnerUserId && order[0].runnerUserId !== userId) {
        throw new PickiError("FORBIDDEN", "Another runner already claimed this order");
      }
      const result = await this.transitions.transition(orderId, toStatus, userId, "Runner accepted", {
        runnerUserId: userId,
      });
      await this.fulfillment.assignOrderOnAccept(userId, orderId);
      return {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
        estimatedReadyAt: order[0].estimatedReadyAt?.toISOString() ?? null,
      };
    }

    if (order[0].runnerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not assigned to this order");
    }

    if (input.action === "picked_up") {
      if (order[0].status !== "READY") {
        throw new PickiError("FORBIDDEN", "Order is not ready for pickup");
      }
      if (!order[0].providerHandoffAt) {
        throw new PickiError("FORBIDDEN", "Quán chưa xác nhận đã giao hàng cho runner");
      }
    }

    const result = await this.transitions.transition(orderId, toStatus, userId, `Runner: ${input.action}`);
    return { id: result.order.id, status: result.order.status };
  }

  async getActiveRoute(userId: string) {
    return this.fulfillment.getActiveRoute(userId);
  }

  async completeStop(userId: string, stopId: string) {
    return this.fulfillment.completeStop(userId, stopId);
  }

  async arriveAtLobby(userId: string, stopId: string) {
    return this.fulfillment.arriveAtLobbyStop(userId, stopId);
  }

  async lobbyHandoffs(userId: string, stopId: string) {
    return this.fulfillment.getLobbyHandoffs(userId, stopId);
  }

  async lobbyAction(
    userId: string,
    stopId: string,
    orderId: string,
    action: "received" | "no_response",
  ) {
    return this.fulfillment.runnerLobbyAction(userId, stopId, orderId, action);
  }
}
