import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, notInArray, or } from "drizzle-orm";
import {
  hasPendingOffer,
  isCookFirstFoodOrder,
  loadOrderDeliveryWindow,
  markOfferAccepted,
  orderItems,
  orders,
  routeOrders,
  runnerActionToStatus,
  runnerOrderOffers,
  runnerPresence,
  runners,
  skipRunnerOffer,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { loadOrderContacts, loadProviderBrand } from "../orders/order-enrichment.js";
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

    const foodTerminal = [
      "DELIVERED",
      "COMPLETED",
      "AT_SHOP",
      "PROCESSING",
      "READY_FOR_RETURN",
      "CUSTOMER_CANCELLED",
      "SYSTEM_CANCELLED",
      "PROVIDER_REJECTED",
    ];
    const laundryReturnStatuses = [
      "RETURN_RUNNER_ASSIGNED",
      "RETURN_PICKED_UP",
      "RETURN_DELIVERING",
    ] as const;

    const poolRows = await this.db
      .select({ order: orders })
      .from(runnerOrderOffers)
      .innerJoin(orders, eq(orders.id, runnerOrderOffers.orderId))
      .where(
        and(
          eq(runnerOrderOffers.runnerUserId, userId),
          eq(runnerOrderOffers.status, "PENDING"),
          eq(runnerOrderOffers.wave, orders.runnerOfferWave),
          isNull(orders.runnerUserId),
          or(
            and(eq(orders.serviceVertical, "FOOD"), eq(orders.status, "PROVIDER_ACCEPTED")),
            and(
              eq(orders.serviceVertical, "FOOD"),
              eq(orders.status, "READY"),
              inArray(orders.orderKind, ["FAMILY_DINNER", "LATE_DINNER", "BREAKFAST_PREORDER"]),
            ),
            and(eq(orders.serviceVertical, "LAUNDRY"), eq(orders.status, "READY_FOR_RETURN")),
          ),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const mineRows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.zoneId, runner[0].zoneId),
          eq(orders.runnerUserId, userId),
          or(
            and(eq(orders.serviceVertical, "FOOD"), notInArray(orders.status, foodTerminal)),
            and(
              eq(orders.serviceVertical, "LAUNDRY"),
              inArray(orders.status, [...laundryReturnStatuses]),
            ),
          ),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const mapOrder = async (o: typeof orders.$inferSelect) => {
      const routeLink = await this.db
        .select({ routeId: routeOrders.routeId })
        .from(routeOrders)
        .where(eq(routeOrders.orderId, o.id))
        .limit(1);
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        providerBrandName: await loadProviderBrand(this.db, o.providerLocationId),
        status: o.status,
        serviceVertical: o.serviceVertical,
        orderKind: o.orderKind ?? "STANDARD",
        serviceDate: o.serviceDate ?? null,
        subtotalVnd: o.subtotalVnd,
        deliveryFeeVnd: o.deliveryFeeVnd,
        runnerPayableVnd: o.runnerPayable,
        totalVnd: o.totalVnd,
        assignedToMe: o.runnerUserId === userId,
        estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
        providerHandoffAt: o.providerHandoffAt?.toISOString() ?? null,
        runnerSoughtAt: o.runnerSoughtAt?.toISOString() ?? null,
        routeId: routeLink[0]?.routeId ?? null,
        deliveryWindow: await loadOrderDeliveryWindow(this.db, o),
        delivery: {
          building: o.deliveryBuilding,
          apartment: o.deliveryApartment,
        },
        items: await this.db.select().from(orderItems).where(eq(orderItems.orderId, o.id)),
        contacts: await loadOrderContacts(this.db, o),
      };
    };

    const pool = await Promise.all(poolRows.map((r) => mapOrder(r.order)));
    const mine = await Promise.all(mineRows.map(mapOrder));

    return {
      orders: [...pool, ...mine],
      pool,
      mine,
    };
  }

  async listOrderHistory(userId: string, limit = 30) {
    const runner = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!runner[0]) {
      throw new PickiError("FORBIDDEN", "Runner profile not found");
    }

    const terminal = [
      "DELIVERED",
      "COMPLETED",
      "CUSTOMER_CANCELLED",
      "SYSTEM_CANCELLED",
      "PROVIDER_REJECTED",
    ];

    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.runnerUserId, userId), inArray(orders.status, terminal)))
      .orderBy(desc(orders.updatedAt))
      .limit(limit);

    return {
      orders: await Promise.all(
        rows.map(async (o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          providerBrandName: await loadProviderBrand(this.db, o.providerLocationId),
          status: o.status,
          serviceVertical: o.serviceVertical,
          deliveryFeeVnd: o.deliveryFeeVnd,
          runnerPayableVnd: o.runnerPayable,
          totalVnd: o.totalVnd,
          completedAt: o.updatedAt.toISOString(),
          delivery: {
            building: o.deliveryBuilding,
            apartment: o.deliveryApartment,
          },
        })),
      ),
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

    if (input.action === "skip") {
      const ok = await skipRunnerOffer(this.db, orderId, userId);
      if (!ok) {
        throw new PickiError("FORBIDDEN", "Không thể bỏ qua đơn này");
      }
      return { id: orderId, skipped: true };
    }

    let toStatus = runnerActionToStatus(input.action);

    if (input.action === "accept") {
      const isReturn =
        order[0].serviceVertical === "LAUNDRY" && order[0].status === "READY_FOR_RETURN";
      const isInbound =
        order[0].serviceVertical !== "LAUNDRY" &&
        !isCookFirstFoodOrder(order[0]) &&
        order[0].status === "PROVIDER_ACCEPTED";
      const isCookFirstReady =
        isCookFirstFoodOrder(order[0]) && order[0].status === "READY";

      if (!isReturn && !isInbound && !isCookFirstReady) {
        throw new PickiError(
          "FORBIDDEN",
          isCookFirstFoodOrder(order[0])
            ? "Bếp phải nấu xong và bấm Tìm runner trước"
            : "Quán phải nhận đơn trước — runner chỉ nhận khi đang tìm runner",
        );
      }
      if (!order[0].runnerSoughtAt) {
        throw new PickiError("FORBIDDEN", "Quán chưa bấm Tìm runner");
      }
      const offered = await hasPendingOffer(
        this.db,
        orderId,
        userId,
        order[0].runnerOfferWave ?? 0,
      );
      if (!offered) {
        throw new PickiError("FORBIDDEN", "Đơn không còn trong danh sách mời của bạn");
      }
      if (order[0].runnerUserId && order[0].runnerUserId !== userId) {
        throw new PickiError("FORBIDDEN", "Another runner already claimed this order");
      }
      if (isReturn) {
        toStatus = "RETURN_RUNNER_ASSIGNED";
      }

      await this.db.transaction(async (tx) => {
        await markOfferAccepted(tx, orderId, order[0]!.runnerOfferWave ?? 0, userId);
      });

      if (isCookFirstReady) {
        await this.db
          .update(orders)
          .set({ runnerUserId: userId, updatedAt: new Date() })
          .where(eq(orders.id, orderId));
        await this.fulfillment.assignOrderOnAccept(userId, orderId);
        return {
          id: order[0].id,
          orderNumber: order[0].orderNumber,
          status: "READY",
          estimatedReadyAt: order[0].estimatedReadyAt?.toISOString() ?? null,
        };
      }

      await this.transitions.transition(orderId, toStatus, userId, "Runner accepted", {
        runnerUserId: userId,
      });
      await this.fulfillment.assignOrderOnAccept(userId, orderId);
      return {
        id: order[0].id,
        orderNumber: order[0].orderNumber,
        status: toStatus,
        estimatedReadyAt: order[0].estimatedReadyAt?.toISOString() ?? null,
      };
    }

    if (order[0].runnerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not assigned to this order");
    }

    if (order[0].serviceVertical === "LAUNDRY") {
      throw new PickiError(
        "FORBIDDEN",
        "Đơn giặt dùng Route — hoàn thành từng điểm dừng trên bản đồ route",
      );
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
