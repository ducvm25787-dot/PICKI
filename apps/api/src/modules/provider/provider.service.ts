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

    return {
      locations: rows.map((r) => ({
        providerId: r.provider.id,
        providerSlug: r.provider.slug,
        brandName: r.provider.brandName,
        locationId: r.location?.id ?? null,
        locationName: r.location?.displayName ?? r.provider.brandName,
        role: r.member.role,
      })),
    };
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
          ]),
        ),
      )
      .orderBy(desc(orders.createdAt))
      .limit(50);

    return {
      orders: await Promise.all(
        rows.map(async (o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
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
        })),
      ),
    };
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

    if (input.action === "accept" && order[0].paymentMode === "PAY_ON_PICKI" && order[0].status === "CREATED") {
      throw new PickiError("FORBIDDEN", "Order awaiting online payment");
    }

    if (input.action === "handoff") {
      return this.providerHandoff(userId, order[0]);
    }

    if (input.action === "preparing" && order[0].status !== "RUNNER_ASSIGNED") {
      throw new PickiError("FORBIDDEN", "Runner phải nhận đơn trước khi bắt đầu nấu");
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

    return {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: refreshed[0]?.status ?? result.order.status,
      ...orderHandoffFields(refreshed[0] ?? result.order),
      runner: await loadRunnerSummary(this.db, refreshed[0]?.runnerUserId ?? null),
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
