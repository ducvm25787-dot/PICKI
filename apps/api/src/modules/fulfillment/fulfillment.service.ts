import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  canBatchOrderWithSettings,
  canCompleteLobbyStop,
  DEFAULT_BATCH_SETTINGS,
  deliveries,
  deliveryRoutes,
  lobbyHandoffs,
  orders,
  pickiPoints,
  planLaundryInboundStops,
  planLaundryReturnStops,
  planRouteStops,
  providerLocations,
  routeOrders,
  routeStops,
  zoneFulfillmentSettings,
  type PickiDb,
  type RouteOrderInput,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import { OutboxService } from "../outbox/outbox.service.js";

type PickiTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

@Injectable()
export class FulfillmentService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async assignOrderOnAccept(runnerUserId: string, orderId: string) {
    const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = orderRow[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    const location = await this.db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, order.providerLocationId))
      .limit(1);

    const input = this.toRouteOrderInput(order, location[0]?.displayName ?? "Quán");

    return this.db.transaction(async (tx) => {
      const [delivery] = await tx
        .insert(deliveries)
        .values({
          orderId: order.id,
          zoneId: order.zoneId,
          status: "ASSIGNED",
        })
        .onConflictDoUpdate({
          target: deliveries.orderId,
          set: { status: "ASSIGNED", updatedAt: new Date() },
        })
        .returning();

      if (!delivery) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create delivery");
      }

      let route = await this.findActiveRoute(tx, runnerUserId, order.zoneId);

      if (route) {
        const existing = await this.loadRouteOrders(tx, route.id);
        const settings = await this.loadBatchSettings(tx, order.zoneId);
        if (!canBatchOrderWithSettings(existing, input, settings)) {
          if (existing.length === 0) {
            await tx.delete(routeStops).where(eq(routeStops.routeId, route.id));
            await tx.delete(routeOrders).where(eq(routeOrders.routeId, route.id));
            await tx.delete(deliveryRoutes).where(eq(deliveryRoutes.id, route.id));
          }
          route = undefined;
        }
      }

      if (!route) {
        const [created] = await tx
          .insert(deliveryRoutes)
          .values({
            zoneId: order.zoneId,
            runnerUserId,
            status: "PLANNED",
          })
          .returning();
        if (!created) {
          throw new PickiError("INTERNAL_ERROR", "Failed to create route");
        }
        route = created;
      }

      // Laundry return leg reuses orderId — move from completed inbound route to active route.
      await tx
        .insert(routeOrders)
        .values({
          routeId: route.id,
          orderId: order.id,
          deliveryId: delivery.id,
        })
        .onConflictDoUpdate({
          target: routeOrders.orderId,
          set: { routeId: route.id, deliveryId: delivery.id },
        });

      await this.rebuildStops(tx, route.id);
      return { routeId: route.id };
    });
  }

  async getActiveRoute(runnerUserId: string) {
    const routes = await this.db
      .select()
      .from(deliveryRoutes)
      .where(
        and(
          eq(deliveryRoutes.runnerUserId, runnerUserId),
          inArray(deliveryRoutes.status, ["PLANNED", "IN_PROGRESS"]),
        ),
      )
      .orderBy(desc(deliveryRoutes.createdAt));

    let active: (typeof deliveryRoutes.$inferSelect) | undefined;
    let stops: (typeof routeStops.$inferSelect)[] = [];

    for (const candidate of routes) {
      const linkedCount = await this.db
        .select({ orderId: routeOrders.orderId })
        .from(routeOrders)
        .where(eq(routeOrders.routeId, candidate.id));

      const candidateStops = await this.db
        .select()
        .from(routeStops)
        .where(eq(routeStops.routeId, candidate.id))
        .orderBy(asc(routeStops.sequence));

      if (linkedCount.length === 0 && candidateStops.length === 0) {
        continue;
      }

      active = candidate;
      stops = candidateStops;
      break;
    }

    if (!active) {
      return { route: null };
    }

    const route = [active];

    const stopPayload = await Promise.all(
      stops.map(async (s) => {
        const base = {
          id: s.id,
          sequence: s.sequence,
          stopType: s.stopType,
          status: s.status,
          orderId: s.orderId,
          label: s.label,
          building: s.building,
          apartment: s.apartment,
          arrivedAt: s.arrivedAt?.toISOString() ?? null,
        };
        if (
          (s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT") &&
          s.status === "ARRIVED"
        ) {
          const handoffs = await this.loadHandoffsForStop(s.id);
          return { ...base, handoffs };
        }
        return base;
      }),
    );

    const linked = await this.db
      .select({
        orderId: routeOrders.orderId,
        orderNumber: orders.orderNumber,
      })
      .from(routeOrders)
      .innerJoin(orders, eq(routeOrders.orderId, orders.id))
      .where(eq(routeOrders.routeId, route[0].id));

    return {
      route: {
        id: route[0].id,
        status: route[0].status,
        orderCount: linked.length,
        orders: linked,
        stops: stopPayload,
      },
    };
  }

  async arriveAtLobbyStop(runnerUserId: string, stopId: string) {
    const stop = await this.getRunnerStop(runnerUserId, stopId);
    if (stop.stopType !== "LOBBY_DROPOFF" && stop.stopType !== "PICKI_POINT") {
      throw new PickiError("FORBIDDEN", "Not a lobby stop");
    }
    if (stop.status !== "PENDING") {
      throw new PickiError("FORBIDDEN", "Lobby stop already started");
    }

    const orderIds = await this.resolveStopOrders(stop);
    const now = new Date();

    await this.db.transaction(async (tx) => {
      await tx
        .update(routeStops)
        .set({ status: "ARRIVED", arrivedAt: now })
        .where(eq(routeStops.id, stopId));

      for (const orderId of orderIds) {
        await tx
          .insert(lobbyHandoffs)
          .values({
            routeStopId: stopId,
            orderId,
            pickiPointId: stop.pickiPointId,
            customerStatus: "WAITING",
            runnerArrivedAt: now,
          })
          .onConflictDoNothing();

        const orderRow = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        if (orderRow[0]) {
          await this.outbox.enqueue(tx, {
            eventType: "runner.arrived_lobby",
            aggregateType: "order",
            aggregateId: orderId,
            payload: {
              orderId,
              orderNumber: orderRow[0].orderNumber,
              customerUserId: orderRow[0].customerUserId,
            },
          });
        }
      }
    });

    return {
      stopId,
      event: "RUNNER_ARRIVED_LOBBY",
      handoffs: await this.loadHandoffsForStop(stopId),
    };
  }

  async getLobbyHandoffs(runnerUserId: string, stopId: string) {
    await this.getRunnerStop(runnerUserId, stopId);
    return { handoffs: await this.loadHandoffsForStop(stopId) };
  }

  async runnerLobbyAction(
    runnerUserId: string,
    stopId: string,
    orderId: string,
    action: "received" | "no_response",
  ) {
    await this.getRunnerStop(runnerUserId, stopId);

    const handoff = await this.db
      .select()
      .from(lobbyHandoffs)
      .where(and(eq(lobbyHandoffs.routeStopId, stopId), eq(lobbyHandoffs.orderId, orderId)))
      .limit(1);
    if (!handoff[0]) {
      throw new PickiError("NOT_FOUND", "Handoff not found");
    }

    const now = new Date();
    const status = action === "received" ? "RECEIVED" : "NO_RESPONSE";

    await this.db
      .update(lobbyHandoffs)
      .set({
        customerStatus: status,
        receivedAt: action === "received" ? now : null,
      })
      .where(eq(lobbyHandoffs.id, handoff[0].id));

    if (action === "received") {
      await this.transitions.transition(orderId, "DELIVERED", runnerUserId, "Lobby pickup received");
      await this.db
        .update(deliveries)
        .set({ status: "COMPLETED", updatedAt: now })
        .where(eq(deliveries.orderId, orderId));
      await this.skipApartmentStopsForOrder(orderId);
    }

    return { orderId, customerStatus: status };
  }

  async getOrderLobby(customerUserId: string, orderId: string) {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0] || order[0].customerUserId !== customerUserId) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    const handoff = await this.db
      .select({
        handoff: lobbyHandoffs,
        stop: routeStops,
        pointName: pickiPoints.name,
      })
      .from(lobbyHandoffs)
      .innerJoin(routeStops, eq(lobbyHandoffs.routeStopId, routeStops.id))
      .leftJoin(pickiPoints, eq(lobbyHandoffs.pickiPointId, pickiPoints.id))
      .where(eq(lobbyHandoffs.orderId, orderId))
      .orderBy(desc(lobbyHandoffs.runnerArrivedAt))
      .limit(1);

    const row = handoff[0];
    if (!row) {
      return { lobby: null };
    }

    return {
      lobby: {
        building: row.stop.building,
        pickiPointName: row.pointName,
        runnerArrived: row.handoff.runnerArrivedAt != null,
        customerStatus: row.handoff.customerStatus,
        stopStatus: row.stop.status,
      },
    };
  }

  async customerLobbyAction(customerUserId: string, orderId: string, action: "coming_down") {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0] || order[0].customerUserId !== customerUserId) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    const handoff = await this.db
      .select()
      .from(lobbyHandoffs)
      .where(eq(lobbyHandoffs.orderId, orderId))
      .orderBy(desc(lobbyHandoffs.runnerArrivedAt))
      .limit(1);
    if (!handoff[0] || !handoff[0].runnerArrivedAt) {
      throw new PickiError("FORBIDDEN", "Runner has not arrived at lobby yet");
    }

    if (action === "coming_down") {
      await this.db
        .update(lobbyHandoffs)
        .set({ customerStatus: "COMING_DOWN", customerUpdatedAt: new Date() })
        .where(eq(lobbyHandoffs.id, handoff[0].id));
    }

    return { customerStatus: "COMING_DOWN" };
  }

  async completeStop(runnerUserId: string, stopId: string) {
    const stopRow = await this.db.select().from(routeStops).where(eq(routeStops.id, stopId)).limit(1);
    const stop = stopRow[0];
    if (!stop) {
      throw new PickiError("NOT_FOUND", "Stop not found");
    }

    const routeRow = await this.db
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.id, stop.routeId))
      .limit(1);
    const route = routeRow[0];
    if (!route || route.runnerUserId !== runnerUserId) {
      throw new PickiError("FORBIDDEN", "Not your route");
    }
    if (stop.status === "COMPLETED") {
      throw new PickiError("FORBIDDEN", "Stop already completed");
    }

    const isLobby = stop.stopType === "LOBBY_DROPOFF" || stop.stopType === "PICKI_POINT";
    if (isLobby) {
      if (stop.status !== "ARRIVED") {
        throw new PickiError("FORBIDDEN", "Nhấn [Đã đến sảnh] trước khi hoàn thành");
      }
      const handoffs = await this.loadHandoffsForStop(stopId);
      if (!canCompleteLobbyStop(handoffs)) {
        throw new PickiError("FORBIDDEN", "Chưa xử lý hết đơn tại sảnh");
      }
    }

    const affectedOrderIds = await this.resolveStopOrders(stop);

    if (stop.stopType === "PICKUP") {
      await this.assertPickupStopReady(affectedOrderIds);
    } else if (stop.stopType === "CUSTOMER_PICKUP") {
      await this.assertLaundryCustomerPickupReady(affectedOrderIds);
    } else if (stop.stopType === "PROVIDER_DROPOFF") {
      await this.assertLaundryShopDropReady(affectedOrderIds);
    } else if (stop.stopType === "RETURN_PICKUP") {
      await this.assertLaundryReturnPickupReady(affectedOrderIds);
    } else if (stop.stopType === "RETURN_DROPOFF") {
      await this.assertLaundryReturnDropReady(affectedOrderIds);
    } else if (stop.stopType === "APARTMENT_DROPOFF") {
      for (const orderId of affectedOrderIds) {
        await this.assertApartmentStopReady(orderId);
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(routeStops)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(routeStops.id, stopId));

      if (route.status === "PLANNED") {
        await tx
          .update(deliveryRoutes)
          .set({ status: "IN_PROGRESS", updatedAt: new Date() })
          .where(eq(deliveryRoutes.id, route.id));
      }

      if (isLobby) {
        const handoffs = await this.loadHandoffsForStop(stopId);
        for (const h of handoffs) {
          if (h.customerStatus === "NO_RESPONSE") {
            await this.applyLobbyNoResponse(runnerUserId, h.orderId);
          }
        }
      } else {
        for (const orderId of affectedOrderIds) {
          await this.applyStopToOrder(runnerUserId, stop.stopType, orderId);
        }
      }

      const pending = await tx
        .select()
        .from(routeStops)
        .where(and(eq(routeStops.routeId, route.id), eq(routeStops.status, "PENDING")));

      if (pending.length === 0) {
        await tx
          .update(deliveryRoutes)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(deliveryRoutes.id, route.id));

        const routeOrderRows = await tx
          .select()
          .from(routeOrders)
          .where(eq(routeOrders.routeId, route.id));

        for (const ro of routeOrderRows) {
          await tx
            .update(deliveries)
            .set({ status: "COMPLETED", updatedAt: new Date() })
            .where(eq(deliveries.id, ro.deliveryId));
        }
      }
    });

    return this.getActiveRoute(runnerUserId);
  }

  private async applyLobbyNoResponse(runnerUserId: string, orderId: string) {
    const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = orderRow[0];
    if (!order || order.runnerUserId !== runnerUserId) return;

    if (order.deliveryHandoffMode === "LOBBY_PICKUP") {
      if (order.status === "PICKED_UP" || order.status === "DELIVERING") {
        await this.transitions.transition(orderId, "DELIVERED", runnerUserId, "Lobby no-show");
        await this.db
          .update(deliveries)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(deliveries.orderId, orderId));
      }
      return;
    }

    if (order.status === "PICKED_UP") {
      await this.transitions.transition(orderId, "DELIVERING", runnerUserId, "Lobby no-response — door attempt");
    }
  }

  private async applyStopToOrder(runnerUserId: string, stopType: string, orderId: string) {
    const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = orderRow[0];
    if (!order || order.runnerUserId !== runnerUserId) return;

    if (stopType === "PICKUP") {
      if (order.status === "PICKED_UP" || order.status === "DELIVERING" || order.status === "DELIVERED") {
        return;
      }
      if (order.status !== "READY" || !order.providerHandoffAt) {
        return;
      }
      await this.transitions.transition(orderId, "PICKED_UP", runnerUserId, "Pickup stop completed");
      await this.db
        .update(deliveries)
        .set({ status: "IN_PROGRESS", updatedAt: new Date() })
        .where(eq(deliveries.orderId, orderId));
    } else if (
      (stopType === "LOBBY_DROPOFF" || stopType === "PICKI_POINT") &&
      order.status === "PICKED_UP"
    ) {
      await this.transitions.transition(orderId, "DELIVERING", runnerUserId, "Lobby handoff completed");
    } else if (stopType === "APARTMENT_DROPOFF" && order.status === "DELIVERING") {
      await this.transitions.transition(orderId, "DELIVERED", runnerUserId, "Door delivery completed");
      await this.db
        .update(deliveries)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(deliveries.orderId, orderId));
    } else if (stopType === "APARTMENT_DROPOFF" && order.status === "PICKED_UP") {
      await this.transitions.transition(orderId, "DELIVERING", runnerUserId, "En route to door");
      await this.transitions.transition(orderId, "DELIVERED", runnerUserId, "Door delivery completed");
      await this.db
        .update(deliveries)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(eq(deliveries.orderId, orderId));
    } else if (stopType === "LOBBY_DROPOFF" && order.status === "PICKED_UP" && !order.deliveryApartment) {
      await this.transitions.transition(orderId, "DELIVERED", runnerUserId, "Lobby-only delivery completed");
    } else if (stopType === "CUSTOMER_PICKUP" && order.serviceVertical === "LAUNDRY") {
      if (order.status === "RUNNER_ASSIGNED") {
        await this.transitions.transition(orderId, "PICKED_UP", runnerUserId, "Laundry picked up at customer");
        await this.db
          .update(deliveries)
          .set({ status: "IN_PROGRESS", updatedAt: new Date() })
          .where(eq(deliveries.orderId, orderId));
      }
    } else if (stopType === "PROVIDER_DROPOFF" && order.serviceVertical === "LAUNDRY") {
      if (order.status === "PICKED_UP") {
        await this.transitions.transition(orderId, "DELIVERING", runnerUserId, "En route to laundry shop");
      }
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (refreshed[0]?.status === "DELIVERING") {
        await this.transitions.transition(orderId, "AT_SHOP", runnerUserId, "Dropped at laundry shop");
        await this.db
          .update(orders)
          .set({ runnerUserId: null, updatedAt: new Date() })
          .where(eq(orders.id, orderId));
        await this.db
          .update(deliveries)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(deliveries.orderId, orderId));
      }
    } else if (stopType === "RETURN_PICKUP" && order.serviceVertical === "LAUNDRY") {
      if (order.status === "RETURN_RUNNER_ASSIGNED") {
        await this.transitions.transition(orderId, "RETURN_PICKED_UP", runnerUserId, "Picked up at laundry shop");
      }
    } else if (stopType === "RETURN_DROPOFF" && order.serviceVertical === "LAUNDRY") {
      if (order.status === "RETURN_PICKED_UP") {
        await this.transitions.transition(orderId, "RETURN_DELIVERING", runnerUserId, "En route to customer");
      }
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (refreshed[0]?.status === "RETURN_DELIVERING") {
        await this.transitions.transition(orderId, "COMPLETED", runnerUserId, "Returned to customer");
        await this.db
          .update(deliveries)
          .set({ status: "COMPLETED", updatedAt: new Date() })
          .where(eq(deliveries.orderId, orderId));
      }
    }
  }

  private async assertLaundryCustomerPickupReady(orderIds: string[]) {
    for (const orderId of orderIds) {
      const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRow[0];
      if (!order || order.serviceVertical !== "LAUNDRY") continue;
      if (order.status === "PICKED_UP" || order.status === "DELIVERING" || order.status === "DELIVERED") {
        continue;
      }
      if (order.status !== "RUNNER_ASSIGNED") {
        throw new PickiError(
          "FORBIDDEN",
          `Đơn giặt ${order.orderNumber} chưa sẵn sàng — chờ tiệm xác nhận và runner nhận đơn`,
        );
      }
    }
  }

  private async assertLaundryShopDropReady(orderIds: string[]) {
    for (const orderId of orderIds) {
      const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRow[0];
      if (!order || order.serviceVertical !== "LAUNDRY") continue;
      if (order.status === "AT_SHOP" || order.status === "COMPLETED") continue;
      if (order.status !== "PICKED_UP" && order.status !== "DELIVERING") {
        throw new PickiError(
          "FORBIDDEN",
          `Phải lấy đồ tại nhà khách trước khi giao tiệm (${order.orderNumber})`,
        );
      }
    }
  }

  private async assertLaundryReturnPickupReady(orderIds: string[]) {
    for (const orderId of orderIds) {
      const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRow[0];
      if (!order || order.serviceVertical !== "LAUNDRY") continue;
      if (order.status === "RETURN_PICKED_UP" || order.status === "COMPLETED") continue;
      if (order.status !== "RETURN_RUNNER_ASSIGNED") {
        throw new PickiError("FORBIDDEN", `Đơn ${order.orderNumber} chưa sẵn sàng lấy tại tiệm`);
      }
    }
  }

  private async assertLaundryReturnDropReady(orderIds: string[]) {
    for (const orderId of orderIds) {
      const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRow[0];
      if (!order || order.serviceVertical !== "LAUNDRY") continue;
      if (order.status === "COMPLETED") continue;
      if (order.status !== "RETURN_PICKED_UP" && order.status !== "RETURN_DELIVERING") {
        throw new PickiError(
          "FORBIDDEN",
          `Phải lấy đồ tại tiệm trước khi giao khách (${order.orderNumber})`,
        );
      }
    }
  }

  private async assertPickupStopReady(orderIds: string[]) {
    for (const orderId of orderIds) {
      const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      const order = orderRow[0];
      if (!order) continue;
      if (order.status === "PICKED_UP" || order.status === "DELIVERING" || order.status === "DELIVERED") {
        continue;
      }
      if (order.status === "RUNNER_ASSIGNED" || order.status === "PREPARING") {
        throw new PickiError(
          "FORBIDDEN",
          "Chưa hết đơn sẵn sàng tại quán — chờ quán nấu xong và bấm bàn giao cho runner",
        );
      }
      if (order.status === "READY" && !order.providerHandoffAt) {
        throw new PickiError(
          "FORBIDDEN",
          "Quán chưa bàn giao hết đơn — chờ quán bấm 'Đã giao cho runner'",
        );
      }
      if (order.status !== "READY") {
        throw new PickiError("FORBIDDEN", `Đơn ${order.orderNumber} chưa sẵn sàng lấy hàng`);
      }
    }
  }

  private async assertApartmentStopReady(orderId: string) {
    const orderRow = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = orderRow[0];
    if (!order || order.status === "DELIVERED") return;
    if (order.status !== "PICKED_UP" && order.status !== "DELIVERING") {
      throw new PickiError("FORBIDDEN", "Phải hoàn thành lấy hàng tại quán trước khi giao căn");
    }
  }

  private async resolveStopOrders(stop: typeof routeStops.$inferSelect): Promise<string[]> {
    if (
      (stop.stopType === "PICKUP" ||
        stop.stopType === "PROVIDER_DROPOFF" ||
        stop.stopType === "RETURN_PICKUP") &&
      stop.providerLocationId
    ) {
      const rows = await this.db
        .select({ orderId: routeOrders.orderId })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(
          and(
            eq(routeOrders.routeId, stop.routeId),
            eq(orders.providerLocationId, stop.providerLocationId),
          ),
        );
      return rows.map((r) => r.orderId);
    }

    if (stop.orderId) return [stop.orderId];

    if (stop.stopType === "LOBBY_DROPOFF" && stop.building) {
      const rows = await this.db
        .select({ orderId: routeOrders.orderId })
        .from(routeOrders)
        .innerJoin(orders, eq(routeOrders.orderId, orders.id))
        .where(
          and(eq(routeOrders.routeId, stop.routeId), eq(orders.deliveryBuilding, stop.building)),
        );
      return rows.map((r) => r.orderId);
    }

    return [];
  }

  private async findActiveRoute(
    tx: PickiTx,
    runnerUserId: string,
    zoneId: string,
  ): Promise<typeof deliveryRoutes.$inferSelect | undefined> {
    const rows = await tx
      .select()
      .from(deliveryRoutes)
      .where(
        and(
          eq(deliveryRoutes.runnerUserId, runnerUserId),
          eq(deliveryRoutes.zoneId, zoneId),
          eq(deliveryRoutes.status, "PLANNED"),
        ),
      )
      .orderBy(asc(deliveryRoutes.createdAt))
      .limit(1);
    return rows[0];
  }

  private async loadRouteOrders(tx: PickiTx, routeId: string): Promise<RouteOrderInput[]> {
    const rows = await tx
      .select({
        order: orders,
        providerName: providerLocations.displayName,
        providerLat: providerLocations.lat,
        providerLng: providerLocations.lng,
      })
      .from(routeOrders)
      .innerJoin(orders, eq(routeOrders.orderId, orders.id))
      .innerJoin(providerLocations, eq(orders.providerLocationId, providerLocations.id))
      .where(eq(routeOrders.routeId, routeId));

    return rows.map((r) => this.toRouteOrderInput(r.order, r.providerName, r.providerLat, r.providerLng));
  }

  private async rebuildStops(tx: PickiTx, routeId: string) {
    const route = await tx
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.id, routeId))
      .limit(1);
    const zoneId = route[0]?.zoneId;

    const inputs = await this.loadRouteOrders(tx, routeId);
    const orderIds = inputs.map((o) => o.orderId);
    const statusRows =
      orderIds.length > 0
        ? await tx
            .select({ id: orders.id, status: orders.status })
            .from(orders)
            .where(inArray(orders.id, orderIds))
        : [];
    const statusById = new Map(statusRows.map((r) => [r.id, r.status]));
    const allLaundry = inputs.every((o) => o.serviceVertical === "LAUNDRY");
    const isReturnLeg = inputs.some((o) => {
      const s = statusById.get(o.orderId);
      return (
        s === "RETURN_RUNNER_ASSIGNED" ||
        s === "RETURN_PICKED_UP" ||
        s === "RETURN_DELIVERING"
      );
    });
    let planned;
    if (allLaundry && isReturnLeg) {
      planned = planLaundryReturnStops(inputs);
    } else if (allLaundry) {
      planned = planLaundryInboundStops(inputs);
    } else {
      planned = planRouteStops(inputs);
    }

    await tx.delete(routeStops).where(eq(routeStops.routeId, routeId));

    if (planned.length === 0) return;

    for (let idx = 0; idx < planned.length; idx++) {
      const s = planned[idx]!;
      let pickiPointId: string | null = null;
      if (zoneId && s.building && (s.stopType === "LOBBY_DROPOFF" || s.stopType === "PICKI_POINT")) {
        const point = await tx
          .select()
          .from(pickiPoints)
          .where(
            and(
              eq(pickiPoints.zoneId, zoneId),
              eq(pickiPoints.building, s.building),
              eq(pickiPoints.pointType, "LOBBY"),
              eq(pickiPoints.status, "ACTIVE"),
            ),
          )
          .limit(1);
        pickiPointId = point[0]?.id ?? null;
      }

      await tx.insert(routeStops).values({
        routeId,
        sequence: idx + 1,
        stopType: s.stopType,
        orderId: s.orderId,
        providerLocationId: s.providerLocationId,
        building: s.building,
        floor: s.floor,
        apartment: s.apartment,
        lat: s.lat,
        lng: s.lng,
        label: pickiPointId ? `${s.label} · Picki Point` : s.label,
        pickiPointId,
      });
    }
  }

  private async loadBatchSettings(tx: PickiTx, zoneId: string) {
    const row = await tx
      .select()
      .from(zoneFulfillmentSettings)
      .where(eq(zoneFulfillmentSettings.zoneId, zoneId))
      .limit(1);
    if (!row[0]) return DEFAULT_BATCH_SETTINGS;
    return {
      maxBatchOrders: row[0].maxBatchOrders,
      batchWaitWindowMinutes: row[0].batchWaitWindowMinutes,
    };
  }

  private async getRunnerStop(runnerUserId: string, stopId: string) {
    const stopRow = await this.db.select().from(routeStops).where(eq(routeStops.id, stopId)).limit(1);
    const stop = stopRow[0];
    if (!stop) throw new PickiError("NOT_FOUND", "Stop not found");

    const routeRow = await this.db
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.id, stop.routeId))
      .limit(1);
    if (!routeRow[0] || routeRow[0].runnerUserId !== runnerUserId) {
      throw new PickiError("FORBIDDEN", "Not your route");
    }
    return stop;
  }

  private async loadHandoffsForStop(stopId: string) {
    const rows = await this.db
      .select({
        handoff: lobbyHandoffs,
        orderNumber: orders.orderNumber,
        apartment: orders.deliveryApartment,
      })
      .from(lobbyHandoffs)
      .innerJoin(orders, eq(lobbyHandoffs.orderId, orders.id))
      .where(eq(lobbyHandoffs.routeStopId, stopId));

    return rows.map((r) => ({
      orderId: r.handoff.orderId,
      orderNumber: r.orderNumber,
      apartment: r.apartment,
      customerStatus: r.handoff.customerStatus,
      runnerArrivedAt: r.handoff.runnerArrivedAt?.toISOString() ?? null,
    }));
  }

  private async skipApartmentStopsForOrder(orderId: string) {
    await this.db
      .update(routeStops)
      .set({ status: "SKIPPED" })
      .where(
        and(
          eq(routeStops.orderId, orderId),
          eq(routeStops.stopType, "APARTMENT_DROPOFF"),
          eq(routeStops.status, "PENDING"),
        ),
      );
  }

  private toRouteOrderInput(
    order: typeof orders.$inferSelect,
    providerName: string,
    providerLat?: number | null,
    providerLng?: number | null,
  ): RouteOrderInput {
    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      serviceVertical: order.serviceVertical as "FOOD" | "LAUNDRY",
      providerLocationId: order.providerLocationId,
      providerName,
      providerLat: providerLat ?? null,
      providerLng: providerLng ?? null,
      deliveryHandoffMode:
        order.deliveryHandoffMode === "DOOR_DELIVERY" ? "DOOR_DELIVERY" : "LOBBY_PICKUP",
      deliveryAddressType: order.deliveryAddressType,
      deliveryBuilding: order.deliveryBuilding,
      deliveryHouseNumber: order.deliveryHouseNumber,
      deliveryAlley: order.deliveryAlley,
      deliveryStreet: order.deliveryStreet,
      deliveryWard: order.deliveryWard,
      deliveryFloor: order.deliveryFloor,
      deliveryApartment: order.deliveryApartment,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      readyAt: order.updatedAt,
    };
  }
}
