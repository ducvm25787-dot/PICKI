import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  addresses,
  buildOrderNumber,
  canCustomerCancel,
  listLocationMenu,
  lobbyHandoffs,
  orderItems,
  orders,
  orderStatusHistory,
  pickiPoints,
  providers,
  randomOrderSuffix4,
  routeOrders,
  routeStops,
  type PickiDb,
  type PickiSql,
  providerLocations,
  providerZoneMemberships,
  userZoneMemberships,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { loadRunnerSummary, orderHandoffFields } from "./order-enrichment.js";
import { OrderTransitionService } from "./order-transition.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { AddressesService } from "../addresses/addresses.service.js";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createOrderSchema } from "./dto.js";

type CreateOrderInput = z.infer<typeof createOrderSchema>;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(AddressesService) private readonly addresses: AddressesService,
  ) {}

  async create(userId: string, input: CreateOrderInput) {
    if (input.idempotencyKey) {
      const existing = await this.db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing[0]) {
        return await this.toOrderDto(existing[0], await this.loadItems(existing[0].id));
      }
    }

    const membership = await this.db
      .select()
      .from(userZoneMemberships)
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.zoneId, input.zoneId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      )
      .limit(1);

    if (!membership[0]) {
      throw new PickiError("FORBIDDEN", "Join the Zone before ordering");
    }

    const location = await this.db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, input.providerLocationId))
      .limit(1);

    if (!location[0] || location[0].status !== "ACTIVE") {
      throw new PickiError("NOT_FOUND", "Provider location not available");
    }

    const inZone = await this.db
      .select()
      .from(providerZoneMemberships)
      .where(
        and(
          eq(providerZoneMemberships.providerLocationId, input.providerLocationId),
          eq(providerZoneMemberships.zoneId, input.zoneId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!inZone[0]) {
      throw new PickiError("FORBIDDEN", "Provider does not serve this Zone");
    }

    const addr = await this.addresses.resolveDeliveryAddress(userId, input.zoneId, input.addressId);

    const isStreet = addr.addressType === "STREET_ADDRESS";
    let handoffMode = input.deliveryHandoffMode;

    if (isStreet) {
      handoffMode = "DOOR_DELIVERY";
      if (!addr.street?.trim()) {
        throw new PickiError("VALIDATION_ERROR", "Địa chỉ mặt đất cần tên đường/ngõ");
      }
    } else {
      if (
        handoffMode === "DOOR_DELIVERY" &&
        (!addr.building?.trim() || !addr.apartment?.trim())
      ) {
        throw new PickiError(
          "VALIDATION_ERROR",
          "Giao tận căn cần địa chỉ có tòa và số căn",
        );
      }
      if (handoffMode === "LOBBY_PICKUP" && !addr.building?.trim()) {
        throw new PickiError("VALIDATION_ERROR", "Giao tại sảnh cần địa chỉ có tòa nhà");
      }
    }

    const deliveryBuilding = addr.building;
    const deliveryFloor = addr.floor;
    const deliveryApartment = addr.apartment;
    const deliveryNote = addr.deliveryNote;
    const deliveryLat: number | null = null;
    const deliveryLng: number | null = null;

    const menu = await listLocationMenu(this.sql, input.providerLocationId);
    const menuById = new Map(menu.map((m) => [m.offering_id, m]));

    const lineItems = input.items.map((item) => {
      const offering = menuById.get(item.offeringId);
      if (!offering) {
        throw new PickiError("VALIDATION_ERROR", "Invalid offering for this location", {
          details: { offeringId: item.offeringId },
        });
      }
      const lineTotal = offering.amount_vnd * item.quantity;
      return {
        offeringId: item.offeringId,
        name: offering.name,
        description: offering.description,
        unitPriceVnd: offering.amount_vnd,
        quantity: item.quantity,
        lineTotalVnd: lineTotal,
      };
    });

    const subtotalVnd = lineItems.reduce((sum, i) => sum + i.lineTotalVnd, 0);
    const deliveryFeeVnd = 0;
    const totalVnd = subtotalVnd + deliveryFeeVnd;
    return this.db.transaction(async (tx) => {
      const orderNumber = await allocateOrderNumber(tx, input.providerLocationId);
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerUserId: userId,
          zoneId: input.zoneId,
          providerLocationId: input.providerLocationId,
          status: "CREATED",
          paymentMode: input.paymentMode,
          subtotalVnd,
          deliveryFeeVnd,
          totalVnd,
          deliveryAddressId: addr.id,
          deliveryAddressType: addr.addressType,
          deliveryHandoffMode: handoffMode,
          deliveryBuilding,
          deliveryHouseNumber: addr.houseNumber,
          deliveryAlley: addr.alley,
          deliveryStreet: addr.street,
          deliveryWard: addr.ward,
          deliveryCity: addr.city,
          deliveryFloor,
          deliveryApartment,
          deliveryNote,
          deliveryLat,
          deliveryLng,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      if (!order) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create order");
      }

      await tx.insert(orderItems).values(
        lineItems.map((item) => ({
          orderId: order.id,
          offeringId: item.offeringId,
          providerLocationId: input.providerLocationId,
          name: item.name,
          description: item.description,
          unitPriceVnd: item.unitPriceVnd,
          quantity: item.quantity,
          lineTotalVnd: item.lineTotalVnd,
        })),
      );

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: "CREATED",
        actorUserId: userId,
        note: "Order placed (COD pilot)",
      });

      await this.outbox.enqueueOrderStatusChanged(tx, order, null, "CREATED");

      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));

      return await this.toOrderDto(order, items);
    });
  }

  async listMine(userId: string) {
    const rows = await this.db
      .select()
      .from(orders)
      .where(eq(orders.customerUserId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(50);

    return {
      orders: await Promise.all(
        rows.map(async (o) => await this.toOrderDto(o, await this.loadItems(o.id))),
      ),
    };
  }

  async getById(userId: string, orderId: string) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }
    if (order.customerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not your order");
    }
    return await this.toOrderDto(
      order,
      await this.loadItems(order.id),
      await this.loadFulfillment(order.id),
      await this.loadLobby(order.id),
    );
  }

  async customerCancel(userId: string, orderId: string) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order || order.customerUserId !== userId) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }
    if (!canCustomerCancel(order.status)) {
      throw new PickiError("FORBIDDEN", `Không thể hủy đơn ở trạng thái ${order.status}`);
    }

    const result = await this.transitions.transition(
      orderId,
      "CUSTOMER_CANCELLED",
      userId,
      "Customer cancelled",
    );

    return {
      id: result.order.id,
      orderNumber: result.order.orderNumber,
      status: result.order.status,
    };
  }

  async customerLobbyAction(userId: string, orderId: string, action: "coming_down") {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0] || order[0].customerUserId !== userId) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    const handoff = await this.db
      .select()
      .from(lobbyHandoffs)
      .where(eq(lobbyHandoffs.orderId, orderId))
      .orderBy(desc(lobbyHandoffs.createdAt))
      .limit(1);
    if (!handoff[0]?.runnerArrivedAt) {
      throw new PickiError("FORBIDDEN", "Runner chưa đến sảnh");
    }

    if (action === "coming_down") {
      await this.db
        .update(lobbyHandoffs)
        .set({ customerStatus: "COMING_DOWN", customerUpdatedAt: new Date() })
        .where(eq(lobbyHandoffs.id, handoff[0].id));
    }

    return { customerStatus: "COMING_DOWN" };
  }

  private async loadLobby(orderId: string) {
    const row = await this.db
      .select({
        handoff: lobbyHandoffs,
        stop: routeStops,
        pointName: pickiPoints.name,
      })
      .from(lobbyHandoffs)
      .innerJoin(routeStops, eq(lobbyHandoffs.routeStopId, routeStops.id))
      .leftJoin(pickiPoints, eq(lobbyHandoffs.pickiPointId, pickiPoints.id))
      .where(eq(lobbyHandoffs.orderId, orderId))
      .orderBy(desc(lobbyHandoffs.createdAt))
      .limit(1);

    if (!row[0]) return null;

    return {
      building: row[0].stop.building,
      pickiPointName: row[0].pointName,
      runnerArrived: row[0].handoff.runnerArrivedAt != null,
      customerStatus: row[0].handoff.customerStatus,
      stopStatus: row[0].stop.status,
    };
  }

  private async loadFulfillment(orderId: string) {
    const link = await this.db
      .select()
      .from(routeOrders)
      .where(eq(routeOrders.orderId, orderId))
      .limit(1);
    if (!link[0]) return null;

    const stops = await this.db
      .select()
      .from(routeStops)
      .where(eq(routeStops.routeId, link[0].routeId))
      .orderBy(asc(routeStops.sequence));

    const next = stops.find((s) => s.status === "PENDING");
    return {
      routeId: link[0].routeId,
      nextStop: next
        ? { label: next.label, stopType: next.stopType, status: next.status }
        : null,
      completedStops: stops.filter((s) => s.status === "COMPLETED").length,
      totalStops: stops.length,
    };
  }

  private async loadItems(orderId: string) {
    return this.db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  }

  private async toOrderDto(
    order: typeof orders.$inferSelect,
    items: (typeof orderItems.$inferSelect)[],
    fulfillment?: Awaited<ReturnType<OrdersService["loadFulfillment"]>>,
    lobby?: Awaited<ReturnType<OrdersService["loadLobby"]>>,
  ) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      zoneId: order.zoneId,
      providerLocationId: order.providerLocationId,
      status: order.status,
      paymentMode: order.paymentMode,
      subtotalVnd: order.subtotalVnd,
      deliveryFeeVnd: order.deliveryFeeVnd,
      totalVnd: order.totalVnd,
      delivery: {
        addressId: order.deliveryAddressId,
        addressType: order.deliveryAddressType,
        handoffMode: order.deliveryHandoffMode,
        building: order.deliveryBuilding,
        houseNumber: order.deliveryHouseNumber,
        alley: order.deliveryAlley,
        street: order.deliveryStreet,
        ward: order.deliveryWard,
        city: order.deliveryCity,
        floor: order.deliveryFloor,
        apartment: order.deliveryApartment,
        note: order.deliveryNote,
      },
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        unitPriceVnd: i.unitPriceVnd,
        quantity: i.quantity,
        lineTotalVnd: i.lineTotalVnd,
      })),
      createdAt: order.createdAt.toISOString(),
      canCancel: canCustomerCancel(order.status),
      ...orderHandoffFields(order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId),
      fulfillment: fulfillment ?? null,
      lobby: lobby ?? null,
    };
  }
}

type OrderTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

async function allocateOrderNumber(tx: OrderTx, providerLocationId: string): Promise<string> {
  const row = await tx
    .select({ slug: providers.slug })
    .from(providerLocations)
    .innerJoin(providers, eq(providers.id, providerLocations.providerId))
    .where(eq(providerLocations.id, providerLocationId))
    .limit(1);

  const slug = row[0]?.slug ?? "picki";
  const now = new Date();

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = buildOrderNumber(slug, now, randomOrderSuffix4());
    const exists = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.orderNumber, candidate))
      .limit(1);
    if (!exists[0]) return candidate;
  }

  throw new PickiError("INTERNAL_ERROR", "Could not allocate order number");
}
