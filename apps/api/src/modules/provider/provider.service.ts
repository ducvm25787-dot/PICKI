import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  orderItems,
  orders,
  providerActionToStatus,
  providerLiveStatus,
  providerLocations,
  providerMembers,
  providers,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import { loadRunnerSummary, orderHandoffFields } from "../orders/order-enrichment.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import type { z } from "zod";
import type { providerOrderActionSchema, updateLiveStatusSchema } from "./dto.js";

@Injectable()
export class ProviderService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async listMyLocations(userId: string) {
    const rows = await this.db
      .select({
        member: providerMembers,
        location: providerLocations,
        provider: providers,
      })
      .from(providerMembers)
      .innerJoin(providers, eq(providerMembers.providerId, providers.id))
      .leftJoin(providerLocations, eq(providerMembers.providerLocationId, providerLocations.id))
      .where(eq(providerMembers.userId, userId));

    const locations: Array<{
      providerId: string;
      providerSlug: string;
      brandName: string;
      locationId: string | null;
      locationName: string;
      role: string;
    }> = [];

    for (const r of rows) {
      if (r.location?.id) {
        locations.push({
          providerId: r.provider.id,
          providerSlug: r.provider.slug,
          brandName: r.provider.brandName,
          locationId: r.location.id,
          locationName: r.location.displayName,
          role: r.member.role,
        });
        continue;
      }

      // Provider-wide member — all active locations of the brand.
      const allLocations = await this.db
        .select()
        .from(providerLocations)
        .where(
          and(eq(providerLocations.providerId, r.provider.id), eq(providerLocations.status, "ACTIVE")),
        );
      for (const loc of allLocations) {
        locations.push({
          providerId: r.provider.id,
          providerSlug: r.provider.slug,
          brandName: r.provider.brandName,
          locationId: loc.id,
          locationName: loc.displayName,
          role: r.member.role,
        });
      }
    }

    return { locations };
  }

  async listLocationOrders(userId: string, locationId: string) {
    await this.assertLocationAccess(userId, locationId);

    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          inArray(orders.status, [
            "CREATED",
            "PAID",
            "PROVIDER_ACCEPTED",
            "PREPARING",
            "READY",
            "RUNNER_ASSIGNED",
            "PICKED_UP",
            "DELIVERING",
            "AT_SHOP",
            "PROCESSING",
            "READY_FOR_RETURN",
            "RETURN_RUNNER_ASSIGNED",
            "RETURN_PICKED_UP",
            "RETURN_DELIVERING",
          ]),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    const ordersOut = await Promise.all(
      rows.map(async (raw) => {
        const o = await this.ensureRunnerSought(raw);
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          serviceVertical: o.serviceVertical,
          laundryPickupMode: o.laundryPickupMode,
          totalVnd: o.totalVnd,
          paymentMode: o.paymentMode,
          delivery: {
            building: o.deliveryBuilding,
            apartment: o.deliveryApartment,
          },
          createdAt: o.createdAt.toISOString(),
          ...orderHandoffFields(o),
          runner: await loadRunnerSummary(this.db, o.runnerUserId),
          items: await this.db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, o.id)),
        };
      }),
    );

    return { orders: ordersOut };
  }

  async listLocationOrderHistory(userId: string, locationId: string, limit = 30) {
    await this.assertLocationAccess(userId, locationId);

    const terminal = [
      "DELIVERED",
      "COMPLETED",
      "CUSTOMER_CANCELLED",
      "SYSTEM_CANCELLED",
      "PROVIDER_REJECTED",
      "PAYMENT_FAILED",
    ];

    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.providerLocationId, locationId), inArray(orders.status, terminal)))
      .orderBy(desc(orders.updatedAt))
      .limit(limit);

    const ordersOut = await Promise.all(
      rows.map(async (o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalVnd: o.totalVnd,
        paymentMode: o.paymentMode,
        completedAt: o.updatedAt.toISOString(),
        delivery: {
          building: o.deliveryBuilding,
          apartment: o.deliveryApartment,
        },
        runner: await loadRunnerSummary(this.db, o.runnerUserId),
      })),
    );

    return { orders: ordersOut };
  }

  async applyOrderAction(
    userId: string,
    orderId: string,
    input: z.infer<typeof providerOrderActionSchema>,
  ) {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0]) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    await this.assertLocationAccess(userId, order[0].providerLocationId);

    if (order[0].serviceVertical === "LAUNDRY") {
      return this.applyLaundryOrderAction(userId, order[0], input);
    }

    if (input.action === "accept") {
      if (order[0].paymentMode === "PAY_ON_PICKI" && order[0].status === "CREATED") {
        throw new PickiError("FORBIDDEN", "Order awaiting online payment");
      }
      if (order[0].status === "PROVIDER_ACCEPTED") {
        return this.providerFindRunner(userId, order[0]);
      }
      const result = await this.transitions.transition(
        orderId,
        "PROVIDER_ACCEPTED",
        userId,
        "Provider: accept",
      );
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      return this.providerFindRunner(userId, refreshed[0] ?? result.order);
    }

    if (input.action === "handoff") {
      return this.providerHandoff(userId, order[0]);
    }

    if (input.action === "find_runner") {
      return this.providerFindRunner(userId, order[0]);
    }

    if (input.action === "preparing") {
      if (order[0].status !== "RUNNER_ASSIGNED") {
        throw new PickiError("FORBIDDEN", "Runner phải nhận đơn trước khi bắt đầu nấu");
      }
      if (!order[0].runnerUserId) {
        throw new PickiError("FORBIDDEN", "Chưa có runner nhận đơn");
      }
    }

    if (input.action === "ready" && order[0].status !== "PREPARING") {
      throw new PickiError("FORBIDDEN", "Order must be preparing before marking ready");
    }

    const toStatus = providerActionToStatus(input.action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid provider action");
    }

    const result = await this.transitions.transition(orderId, toStatus, userId, `Provider: ${input.action}`);

    const etaPatch = providerEtaPatch(input.action);
    if (etaPatch) {
      await this.db.update(orders).set(etaPatch).where(eq(orders.id, orderId));
    }

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const latest = refreshed[0] ?? result.order;

    return {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: latest.status,
      ...orderHandoffFields(latest),
      runner: await loadRunnerSummary(this.db, latest.runnerUserId ?? null),
    };
  }

  private async applyLaundryOrderAction(
    userId: string,
    order: typeof orders.$inferSelect,
    input: z.infer<typeof providerOrderActionSchema>,
  ) {
    if (input.action === "accept") {
      if (order.paymentMode === "PAY_ON_PICKI" && order.status === "CREATED") {
        throw new PickiError("FORBIDDEN", "Order awaiting online payment");
      }
      if (order.status === "PROVIDER_ACCEPTED") {
        if (order.laundryPickupMode === "HOME_PICKUP") {
          return this.providerFindRunner(userId, order);
        }
        return this.laundryOrderDto(order);
      }
      const result = await this.transitions.transition(
        order.id,
        "PROVIDER_ACCEPTED",
        userId,
        "Laundry: accept",
      );
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      const latest = refreshed[0] ?? result.order;
      if (latest.laundryPickupMode === "HOME_PICKUP") {
        return this.providerFindRunner(userId, latest);
      }
      return this.laundryOrderDto(latest);
    }

    if (input.action === "find_runner") {
      return this.providerFindRunner(userId, order);
    }

    if (input.action === "find_return_runner") {
      return this.providerFindReturnRunner(userId, order);
    }

    if (input.action === "received") {
      if (order.laundryPickupMode !== "SHOP_DROP_OFF") {
        throw new PickiError("FORBIDDEN", "Chỉ áp dụng khi khách tự mang đồ tới tiệm");
      }
      if (order.status !== "PROVIDER_ACCEPTED") {
        throw new PickiError("FORBIDDEN", "Đơn chưa ở trạng thái chờ nhận đồ tại tiệm");
      }
    }

    if (["preparing", "ready", "handoff"].includes(input.action)) {
      throw new PickiError("FORBIDDEN", "Đơn giặt không dùng luồng nấu/bàn giao quán ăn");
    }

    const toStatus = providerActionToStatus(input.action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid laundry action");
    }

    const result = await this.transitions.transition(
      order.id,
      toStatus,
      userId,
      `Laundry: ${input.action}`,
    );
    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.laundryOrderDto(refreshed[0] ?? result.order);
  }

  private async laundryOrderDto(order: typeof orders.$inferSelect) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      ...orderHandoffFields(order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId ?? null),
    };
  }

  private async providerFindReturnRunner(_userId: string, order: typeof orders.$inferSelect) {
    if (order.status !== "READY_FOR_RETURN") {
      throw new PickiError("FORBIDDEN", "Chỉ tìm runner giao lại khi đồ đã sẵn sàng");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          runnerUserId: null,
          runnerSoughtAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

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
          leg: "RETURN",
        },
      });
    });

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.laundryOrderDto(refreshed[0] ?? order);
  }

  private async providerFindRunner(_userId: string, order: typeof orders.$inferSelect) {
    if (order.status !== "PROVIDER_ACCEPTED") {
      throw new PickiError("FORBIDDEN", "Chỉ tìm runner sau khi đã nhận đơn");
    }
    if (order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "Runner đã nhận đơn này");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ runnerSoughtAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));

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
        },
      });
    });

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: refreshed[0]?.status ?? order.status,
      ...orderHandoffFields(refreshed[0] ?? order),
      runner: null,
    };
  }

  private async providerHandoff(userId: string, order: typeof orders.$inferSelect) {
    if (order.status !== "READY") {
      throw new PickiError("FORBIDDEN", "Order must be ready before handoff");
    }
    if (!order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "No runner assigned");
    }
    if (order.providerHandoffAt) {
      throw new PickiError("FORBIDDEN", "Already handed to runner");
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ providerHandoffAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      await this.outbox.enqueue(tx, {
        eventType: "order.provider_handoff",
        aggregateType: "order",
        aggregateId: order.id,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerUserId: order.customerUserId,
          runnerUserId: order.runnerUserId,
          providerLocationId: order.providerLocationId,
          zoneId: order.zoneId,
        },
      });
    });

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: refreshed[0]?.status ?? order.status,
      ...orderHandoffFields(refreshed[0] ?? order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId),
    };
  }

  async getLiveStatus(userId: string, locationId: string) {
    await this.assertLocationAccess(userId, locationId);

    const row = await this.db
      .select()
      .from(providerLiveStatus)
      .where(eq(providerLiveStatus.providerLocationId, locationId))
      .limit(1);

    return {
      locationId,
      status: row[0]?.status ?? "OFFLINE",
      message: row[0]?.message ?? null,
      updatedAt: row[0]?.updatedAt?.toISOString() ?? null,
    };
  }

  async updateLiveStatus(
    userId: string,
    locationId: string,
    input: z.infer<typeof updateLiveStatusSchema>,
  ) {
    await this.assertLocationAccess(userId, locationId);

    await this.db
      .insert(providerLiveStatus)
      .values({
        providerLocationId: locationId,
        status: input.status,
        message: input.message ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: providerLiveStatus.providerLocationId,
        set: {
          status: input.status,
          message: input.message ?? null,
          updatedAt: new Date(),
        },
      });

    return { locationId, status: input.status };
  }

  /** Pilot: đơn đã nhận nhưng chưa tìm runner → tự bổ sung khi load list. */
  private async ensureRunnerSought(order: typeof orders.$inferSelect) {
    if (
      order.status !== "PROVIDER_ACCEPTED" ||
      order.runnerUserId ||
      order.runnerSoughtAt
    ) {
      return order;
    }

    await this.db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ runnerSoughtAt: new Date(), updatedAt: new Date() })
        .where(eq(orders.id, order.id));

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
        },
      });
    });

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return refreshed[0] ?? order;
  }

  private async assertLocationAccess(userId: string, locationId: string) {
    const location = await this.db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!location[0]) {
      throw new PickiError("NOT_FOUND", "Location not found");
    }

    const members = await this.db
      .select()
      .from(providerMembers)
      .where(
        and(
          eq(providerMembers.userId, userId),
          eq(providerMembers.providerId, location[0].providerId),
        ),
      );

    const allowed = members.some(
      (m) => !m.providerLocationId || m.providerLocationId === locationId,
    );
    if (!allowed) {
      throw new PickiError("FORBIDDEN", "Not a staff member for this location");
    }
  }
}

const DEFAULT_PREP_MINUTES = 20;

function providerEtaPatch(action: string): { estimatedReadyAt: Date; updatedAt: Date } | null {
  const now = Date.now();
  switch (action) {
    case "preparing":
      return { estimatedReadyAt: new Date(now + DEFAULT_PREP_MINUTES * 60_000), updatedAt: new Date() };
    case "ready":
      return { estimatedReadyAt: new Date(), updatedAt: new Date() };
    default:
      return null;
  }
}
