import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  buildOrderNumber,
  calculateCustomerDeliveryFeeVnd,
  canCustomerCancel,
  breakfastPreorderDeliveryWindows,
  breakfastPreorderMenuItems,
  breakfastPreorderProviderSettings,
  familyDinnerDeliveryWindows,
  familyDinnerMenuItems,
  familyDinnerProductionBatches,
  familyDinnerProductionItemTotals,
  familyDinnerProviderSettings,
  lateDinnerOfferItems,
  lateDinnerOffers,
  listLocationMenu,
  loadOrderDeliveryWindow,
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
  validateFamilyDinnerBaseMeal,
  isFamilyDinnerSelfCookCategory,
  familyDinnerRiceLineTotalVnd,
  zoneFulfillmentSettings,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import {
  loadOrderContacts,
  loadProviderBrand,
  loadRunnerSummary,
  orderHandoffFields,
} from "./order-enrichment.js";
import { OrderTransitionService } from "./order-transition.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { AddressesService } from "../addresses/addresses.service.js";
import { formatTime, isPastCutoff } from "../family-dinner/family-dinner.service.js";
import {
  isPastBreakfastCutoff,
} from "../breakfast-preorder/breakfast-preorder.service.js";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createOrderSchema, orderCheckoutSchema } from "./dto.js";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type OrderCheckoutInput = z.infer<typeof orderCheckoutSchema>;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(AddressesService) private readonly addresses: AddressesService,
  ) {}

  async quote(userId: string, input: OrderCheckoutInput) {
    await this.assertZoneMember(userId, input.zoneId);
    const { serviceVertical } = await this.resolveLocation(input.providerLocationId, input.zoneId);

    if (input.orderKind === "FAMILY_DINNER") {
      const built = await this.buildFamilyDinnerLineItems(input);
      const deliveryFeeVnd = await this.resolveDeliveryFeeVnd(
        input.zoneId,
        "FOOD",
        input.deliveryHandoffMode,
      );
      return {
        serviceVertical: "FOOD",
        orderKind: "FAMILY_DINNER",
        subtotalVnd: built.subtotalVnd,
        deliveryFeeVnd,
        totalVnd: built.subtotalVnd + deliveryFeeVnd,
        items: built.lineItems.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          lineTotalVnd: i.lineTotalVnd,
          category: i.category,
        })),
        softWarning:
          built.portionCount > 10
            ? "Mâm của bạn đang có khá nhiều món. Hãy kiểm tra lại trước khi đặt."
            : null,
      };
    }

    if (input.orderKind === "BREAKFAST_PREORDER") {
      const built = await this.buildBreakfastLineItems(input);
      const deliveryFeeVnd = await this.resolveDeliveryFeeVnd(
        input.zoneId,
        "FOOD",
        input.deliveryHandoffMode,
      );
      return {
        serviceVertical: "FOOD",
        orderKind: "BREAKFAST_PREORDER",
        subtotalVnd: built.subtotalVnd,
        deliveryFeeVnd,
        totalVnd: built.subtotalVnd + deliveryFeeVnd,
        items: built.lineItems.map((i) => ({
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          lineTotalVnd: i.lineTotalVnd,
        })),
        softWarning: null,
      };
    }

    if (input.orderKind === "LATE_DINNER") {
      const built = await this.buildLateDinnerQuote(input);
      const deliveryFeeVnd = await this.resolveDeliveryFeeVnd(
        input.zoneId,
        "FOOD",
        input.deliveryHandoffMode,
      );
      return {
        serviceVertical: "FOOD",
        orderKind: "LATE_DINNER",
        subtotalVnd: built.subtotalVnd,
        deliveryFeeVnd,
        totalVnd: built.subtotalVnd + deliveryFeeVnd,
        items: [
          {
            lateDinnerOfferId: built.offerId,
            name: built.title,
            quantity: built.quantity,
            lineTotalVnd: built.subtotalVnd,
          },
        ],
        softWarning: null,
      };
    }

    const { lineItems, subtotalVnd } = await this.buildLineItems(
      input.providerLocationId,
      input.items,
    );
    const deliveryFeeVnd = await this.resolveDeliveryFeeVnd(
      input.zoneId,
      serviceVertical as "FOOD" | "LAUNDRY",
      input.deliveryHandoffMode,
    );
    return {
      serviceVertical,
      orderKind: "STANDARD",
      subtotalVnd,
      deliveryFeeVnd,
      totalVnd: subtotalVnd + deliveryFeeVnd,
      items: lineItems.map((i) => ({
        offeringId: i.offeringId,
        name: i.name,
        quantity: i.quantity,
        lineTotalVnd: i.lineTotalVnd,
      })),
    };
  }

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

    await this.assertZoneMember(userId, input.zoneId);
    const { serviceVertical } = await this.resolveLocation(input.providerLocationId, input.zoneId);

    const isFamilyDinner = input.orderKind === "FAMILY_DINNER";
    const isLateDinner = input.orderKind === "LATE_DINNER";
    const isBreakfast = input.orderKind === "BREAKFAST_PREORDER";
    if ((isFamilyDinner || isLateDinner || isBreakfast) && serviceVertical !== "FOOD") {
      throw new PickiError("VALIDATION_ERROR", "Chỉ áp dụng cho Food");
    }

    const addr = await this.addresses.resolveDeliveryAddress(userId, input.zoneId, input.addressId);

    const isStreet = addr.addressType === "STREET_ADDRESS";
    let handoffMode = input.deliveryHandoffMode;

    let laundryPickupMode =
      serviceVertical === "LAUNDRY" ? (input.laundryPickupMode ?? "HOME_PICKUP") : null;

    if (serviceVertical === "LAUNDRY") {
      handoffMode = "DOOR_DELIVERY";
    } else if (isStreet) {
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
    const coords = await this.addresses.getDeliveryCoords(addr.id);
    const deliveryLat: number | null = coords?.lat ?? null;
    const deliveryLng: number | null = coords?.lng ?? null;

    let paymentMode = input.paymentMode;
    let deliveryFeeVnd = 0;
    let totalVnd = 0;
    let subtotalVnd = 0;
    let lineItemsStandard: Awaited<ReturnType<OrdersService["buildLineItems"]>>["lineItems"] = [];
    let lineItemsDinner: Awaited<
      ReturnType<OrdersService["buildFamilyDinnerLineItems"]>
    >["lineItems"] = [];
    let lineItemsBreakfast: Awaited<
      ReturnType<OrdersService["buildBreakfastLineItems"]>
    >["lineItems"] = [];
    let lateQuote: Awaited<ReturnType<OrdersService["buildLateDinnerQuote"]>> | null = null;
    let fulfillmentModes = new Set<string>();
    let serviceDate: string | null = null;
    let deliveryWindowId: string | null = null;
    let breakfastDeliveryWindowId: string | null = null;
    let lateDinnerOfferId: string | null = null;

    if (isFamilyDinner) {
      if (!input.serviceDate || !input.deliveryWindowId) {
        throw new PickiError("VALIDATION_ERROR", "Chọn ngày giao và khung giờ");
      }
      const built = await this.buildFamilyDinnerLineItems(input);
      lineItemsDinner = built.lineItems;
      subtotalVnd = built.subtotalVnd;
      serviceDate = input.serviceDate;
      deliveryWindowId = input.deliveryWindowId;
      paymentMode = "PAY_ON_PICKI";
      deliveryFeeVnd = await this.resolveDeliveryFeeVnd(input.zoneId, "FOOD", handoffMode);
      totalVnd = subtotalVnd + deliveryFeeVnd;
    } else if (isBreakfast) {
      if (!input.serviceDate || !input.deliveryWindowId) {
        throw new PickiError("VALIDATION_ERROR", "Chọn ngày giao và khung giờ");
      }
      const built = await this.buildBreakfastLineItems(input);
      lineItemsBreakfast = built.lineItems;
      subtotalVnd = built.subtotalVnd;
      serviceDate = input.serviceDate;
      breakfastDeliveryWindowId = input.deliveryWindowId;
      paymentMode = "PAY_ON_PICKI";
      deliveryFeeVnd = await this.resolveDeliveryFeeVnd(input.zoneId, "FOOD", handoffMode);
      totalVnd = subtotalVnd + deliveryFeeVnd;
    } else if (isLateDinner) {
      lateQuote = await this.buildLateDinnerQuote(input);
      subtotalVnd = lateQuote.subtotalVnd;
      serviceDate = lateQuote.serviceDate;
      lateDinnerOfferId = lateQuote.offerId;
      paymentMode = "PAY_ON_PICKI";
      deliveryFeeVnd = await this.resolveDeliveryFeeVnd(input.zoneId, "FOOD", handoffMode);
      totalVnd = subtotalVnd + deliveryFeeVnd;
    } else {
      const built = await this.buildLineItems(input.providerLocationId, input.items);
      lineItemsStandard = built.lineItems;
      subtotalVnd = built.subtotalVnd;
      fulfillmentModes = built.fulfillmentModes;

      if (serviceVertical === "LAUNDRY") {
        const hasOnSite = fulfillmentModes.has("ON_SITE");
        const hasPickupReturn = fulfillmentModes.has("PICKUP_AND_RETURN");
        if (hasOnSite && hasPickupReturn) {
          throw new PickiError(
            "VALIDATION_ERROR",
            "Không thể đặt chung dịch vụ lấy về giặt và giặt tại nhà trong một đơn",
          );
        }
        if (hasOnSite) {
          laundryPickupMode = "ON_SITE";
        }
        paymentMode = "PAY_ON_COMPLETION";
        deliveryFeeVnd = 0;
        totalVnd = 0;
      } else {
        deliveryFeeVnd = await this.resolveDeliveryFeeVnd(
          input.zoneId,
          serviceVertical as "FOOD" | "LAUNDRY",
          handoffMode,
        );
        totalVnd = subtotalVnd + deliveryFeeVnd;
      }
    }

    return this.db.transaction(async (tx) => {
      if (isFamilyDinner && deliveryWindowId) {
        await this.reserveFamilyDinnerCapacity(tx, deliveryWindowId, lineItemsDinner);
      }
      if (isBreakfast && breakfastDeliveryWindowId) {
        await this.reserveBreakfastCapacity(tx, breakfastDeliveryWindowId, lineItemsBreakfast);
      }
      if (isLateDinner && lateQuote) {
        await this.reserveLateDinnerCapacity(tx, lateQuote);
      }

      const orderNumber = await allocateOrderNumber(tx, input.providerLocationId);
      const orderKind = isLateDinner
        ? "LATE_DINNER"
        : isFamilyDinner
          ? "FAMILY_DINNER"
          : isBreakfast
            ? "BREAKFAST_PREORDER"
            : "STANDARD";
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerUserId: userId,
          zoneId: input.zoneId,
          providerLocationId: input.providerLocationId,
          status: "CREATED",
          serviceVertical:
            isFamilyDinner || isLateDinner || isBreakfast ? "FOOD" : serviceVertical,
          orderKind,
          serviceDate,
          deliveryWindowId,
          breakfastDeliveryWindowId,
          lateDinnerOfferId,
          laundryPickupMode,
          paymentMode,
          subtotalVnd:
            serviceVertical === "LAUNDRY" && !isFamilyDinner && !isLateDinner && !isBreakfast
              ? 0
              : subtotalVnd,
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

      if (isFamilyDinner) {
        await tx.insert(orderItems).values(
          lineItemsDinner.map((item) => ({
            orderId: order.id,
            offeringId: null,
            familyDinnerMenuItemId: item.menuItemId,
            familyDinnerCategory: item.category,
            prepMode: item.prepMode,
            recipeVersionId: item.recipeVersionId,
            providerLocationId: input.providerLocationId,
            name: item.name,
            description: item.description,
            unitPriceVnd: item.unitPriceVnd,
            quantity: item.quantity,
            lineTotalVnd: item.lineTotalVnd,
          })),
        );
      } else if (isBreakfast) {
        await tx.insert(orderItems).values(
          lineItemsBreakfast.map((item) => ({
            orderId: order.id,
            offeringId: item.offeringId,
            breakfastMenuItemId: item.menuItemId,
            prepMode: "READY_COOKED",
            providerLocationId: input.providerLocationId,
            name: item.name,
            description: item.description,
            unitPriceVnd: item.unitPriceVnd,
            quantity: item.quantity,
            lineTotalVnd: item.lineTotalVnd,
          })),
        );
      } else if (isLateDinner && lateQuote) {
        await tx.insert(orderItems).values({
          orderId: order.id,
          offeringId: null,
          providerLocationId: input.providerLocationId,
          name: lateQuote.title,
          description: "Bữa tối muộn",
          unitPriceVnd: lateQuote.unitPriceVnd,
          quantity: lateQuote.quantity,
          lineTotalVnd: lateQuote.subtotalVnd,
        });
      } else {
        await tx.insert(orderItems).values(
          lineItemsStandard.map((item) => ({
            orderId: order.id,
            offeringId: item.offeringId,
            providerLocationId: input.providerLocationId,
            name: item.name,
            description: item.description,
            unitPriceVnd: item.unitPriceVnd,
            quantity: item.quantity,
            lineTotalVnd: item.lineTotalVnd,
            estimatedDays: item.estimatedDays,
          })),
        );
      }

      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: null,
        toStatus: "CREATED",
        actorUserId: userId,
        note: isLateDinner
          ? "Late Dinner — cần thanh toán trước"
          : isFamilyDinner
            ? "Family Dinner preorder — cần thanh toán trước"
            : serviceVertical === "LAUNDRY"
              ? "Laundry order placed"
              : "Order placed (COD pilot)",
      });

      await this.outbox.enqueueOrderStatusChanged(tx, order, null, "CREATED", userId);

      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

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

    const ordersOut = [];
    for (const o of rows) {
      try {
        ordersOut.push(await this.toOrderDto(o, await this.loadItems(o.id)));
      } catch {
        ordersOut.push(await this.toOrderDtoFallback(o, await this.loadItems(o.id)));
      }
    }

    return { orders: ordersOut };
  }

  /** Minimal DTO if enrichment fails — still show order in list. */
  private async toOrderDtoFallback(
    order: typeof orders.$inferSelect,
    items: (typeof orderItems.$inferSelect)[],
  ) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      providerBrandName: await loadProviderBrand(this.db, order.providerLocationId),
      status: order.status,
      serviceVertical: order.serviceVertical,
      totalVnd: order.totalVnd,
      estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
      runner: await loadRunnerSummary(this.db, order.runnerUserId),
      createdAt: order.createdAt.toISOString(),
      items: items.map((i) => ({ name: i.name, quantity: i.quantity })),
    };
  }

  private async resolveCustomerOrder(userId: string, orderIdOrNumber: string) {
    const byId = await this.db
      .select()
      .from(orders)
      .where(eq(orders.id, orderIdOrNumber))
      .limit(1);
    let order = byId[0];
    if (!order) {
      const byNumber = await this.db
        .select()
        .from(orders)
        .where(eq(orders.orderNumber, orderIdOrNumber))
        .limit(1);
      order = byNumber[0];
    }
    if (!order || order.customerUserId !== userId) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }
    return order;
  }

  async getById(userId: string, orderIdOrNumber: string) {
    const order = await this.resolveCustomerOrder(userId, orderIdOrNumber);
    return await this.toOrderDto(
      order,
      await this.loadItems(order.id),
      await this.loadFulfillment(order.id),
      await this.loadLobby(order.id),
    );
  }

  async customerCancel(userId: string, orderIdOrNumber: string) {
    const order = await this.resolveCustomerOrder(userId, orderIdOrNumber);
    if (order.productionLockedAt) {
      throw new PickiError(
        "FORBIDDEN",
        "Đơn đã khóa sản xuất — không hủy tự phục vụ; liên hệ Ops nếu cần",
      );
    }
    // Preorders only: late dinner is created after lock and may still cancel (restore trays).
    if (order.orderKind === "FAMILY_DINNER" && order.serviceDate) {
      const batch = await this.db
        .select({ status: familyDinnerProductionBatches.status })
        .from(familyDinnerProductionBatches)
        .where(
          and(
            eq(familyDinnerProductionBatches.providerLocationId, order.providerLocationId),
            eq(familyDinnerProductionBatches.serviceDate, order.serviceDate),
          ),
        )
        .limit(1);
      if (batch[0]?.status === "LOCKED") {
        throw new PickiError(
          "FORBIDDEN",
          "Bếp đã chốt nấu — không hủy tự phục vụ",
        );
      }
    }
    if (
      !canCustomerCancel(
        order.status,
        order.serviceVertical as "FOOD" | "LAUNDRY",
        order.laundryPickupMode as "HOME_PICKUP" | "SHOP_DROP_OFF" | "ON_SITE" | null,
      )
    ) {
      throw new PickiError("FORBIDDEN", `Không thể hủy đơn ở trạng thái ${order.status}`);
    }

    const result = await this.transitions.transition(
      order.id,
      "CUSTOMER_CANCELLED",
      userId,
      "Customer cancelled",
    );

    if (order.orderKind === "FAMILY_DINNER" || order.orderKind === "LATE_DINNER" || order.orderKind === "BREAKFAST_PREORDER") {
      await this.db.transaction(async (tx) => {
        if (order.orderKind === "FAMILY_DINNER") {
          await this.restoreFamilyDinnerCapacity(tx, order);
        }
        if (order.orderKind === "BREAKFAST_PREORDER") {
          await this.restoreBreakfastCapacity(tx, order);
        }
        if (order.orderKind === "LATE_DINNER" && order.lateDinnerOfferId) {
          await this.restoreLateDinnerCapacity(tx, order);
        }
      });
    }

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

  private async assertZoneMember(userId: string, zoneId: string) {
    const membership = await this.db
      .select()
      .from(userZoneMemberships)
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.zoneId, zoneId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      )
      .limit(1);
    if (!membership[0]) {
      throw new PickiError("FORBIDDEN", "Join the Zone before ordering");
    }
  }

  private async resolveLocation(providerLocationId: string, zoneId: string) {
    const location = await this.db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, providerLocationId))
      .limit(1);

    if (!location[0] || location[0].status !== "ACTIVE") {
      throw new PickiError("NOT_FOUND", "Provider location not available");
    }

    const providerRow = await this.db
      .select({ providerType: providers.providerType })
      .from(providerLocations)
      .innerJoin(providers, eq(providerLocations.providerId, providers.id))
      .where(eq(providerLocations.id, providerLocationId))
      .limit(1);
    const serviceVertical = providerRow[0]?.providerType === "LAUNDRY" ? "LAUNDRY" : "FOOD";

    const inZone = await this.db
      .select()
      .from(providerZoneMemberships)
      .where(
        and(
          eq(providerZoneMemberships.providerLocationId, providerLocationId),
          eq(providerZoneMemberships.zoneId, zoneId),
          eq(providerZoneMemberships.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!inZone[0]) {
      throw new PickiError("FORBIDDEN", "Provider does not serve this Zone");
    }

    return { location: location[0], serviceVertical };
  }

  private async loadZoneDeliveryFees(zoneId: string) {
    const row = await this.db
      .select({
        foodDeliveryFeeVnd: zoneFulfillmentSettings.foodDeliveryFeeVnd,
        foodDoorDeliveryFeeVnd: zoneFulfillmentSettings.foodDoorDeliveryFeeVnd,
      })
      .from(zoneFulfillmentSettings)
      .where(eq(zoneFulfillmentSettings.zoneId, zoneId))
      .limit(1);
    return row[0] ?? null;
  }

  private async resolveDeliveryFeeVnd(
    zoneId: string,
    serviceVertical: "FOOD" | "LAUNDRY",
    handoffMode: "LOBBY_PICKUP" | "DOOR_DELIVERY",
  ) {
    const zoneSettings = await this.loadZoneDeliveryFees(zoneId);
    return calculateCustomerDeliveryFeeVnd({
      serviceVertical,
      handoffMode,
      zoneSettings,
    });
  }

  private async buildBreakfastLineItems(input: OrderCheckoutInput) {
    if (!input.serviceDate || !input.deliveryWindowId) {
      throw new PickiError("VALIDATION_ERROR", "Chọn ngày giao và khung giờ");
    }

    const settings = await this.db
      .select()
      .from(breakfastPreorderProviderSettings)
      .where(eq(breakfastPreorderProviderSettings.providerLocationId, input.providerLocationId))
      .limit(1);
    if (!settings[0]?.enabled) {
      throw new PickiError("FORBIDDEN", "Quán chưa nhận đặt sáng");
    }
    const openFrom = formatTime(settings[0].openFromTime);
    const cutoff = formatTime(settings[0].cutoffTime);
    if (!isPastBreakfastCutoff(input.serviceDate, openFrom)) {
      throw new PickiError(
        "FORBIDDEN",
        `Chưa tới giờ mở nhận đơn (${openFrom} tối hôm trước)`,
      );
    }
    if (isPastBreakfastCutoff(input.serviceDate, cutoff)) {
      throw new PickiError(
        "CONFLICT",
        `Đã qua giờ chốt đơn (${cutoff}) — thử quán khác hoặc ngày khác`,
      );
    }

    const window = await this.db
      .select()
      .from(breakfastPreorderDeliveryWindows)
      .where(eq(breakfastPreorderDeliveryWindows.id, input.deliveryWindowId))
      .limit(1);
    const w = window[0];
    if (
      !w ||
      w.providerLocationId !== input.providerLocationId ||
      w.serviceDate !== input.serviceDate
    ) {
      throw new PickiError("VALIDATION_ERROR", "Khung giờ giao không hợp lệ");
    }
    if (w.status !== "OPEN" || w.remainingCapacity < 1) {
      throw new PickiError("CONFLICT", "Khung giờ giao đã đầy");
    }

    const menuItemIds = input.items.map((i) => i.menuItemId).filter(Boolean) as string[];
    if (menuItemIds.length !== input.items.length) {
      throw new PickiError("VALIDATION_ERROR", "Sáng mai cần menuItemId");
    }

    const rows = await this.db
      .select()
      .from(breakfastPreorderMenuItems)
      .where(
        sql`${breakfastPreorderMenuItems.id} IN (${sql.join(
          menuItemIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lineItems = input.items.map((item) => {
      const row = byId.get(item.menuItemId!);
      if (!row || row.status !== "ACTIVE") {
        throw new PickiError("VALIDATION_ERROR", "Món không còn trên menu", {
          details: { menuItemId: item.menuItemId },
        });
      }
      if (row.remainingCapacity != null && row.remainingCapacity < item.quantity) {
        throw new PickiError("CONFLICT", `Hết suất: ${row.name}`);
      }
      return {
        menuItemId: row.id,
        offeringId: row.offeringId,
        name: row.name,
        description: row.description,
        unitPriceVnd: row.priceVnd,
        quantity: item.quantity,
        lineTotalVnd: row.priceVnd * item.quantity,
      };
    });

    const subtotalVnd = lineItems.reduce((s, i) => s + i.lineTotalVnd, 0);
    return { lineItems, subtotalVnd };
  }

  private async reserveBreakfastCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    deliveryWindowId: string,
    lineItems: { menuItemId: string; quantity: number; name: string }[],
  ) {
    const [win] = await tx
      .update(breakfastPreorderDeliveryWindows)
      .set({
        remainingCapacity: sql`${breakfastPreorderDeliveryWindows.remainingCapacity} - 1`,
        status: sql`CASE WHEN ${breakfastPreorderDeliveryWindows.remainingCapacity} - 1 <= 0 THEN 'FULL' ELSE ${breakfastPreorderDeliveryWindows.status} END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(breakfastPreorderDeliveryWindows.id, deliveryWindowId),
          eq(breakfastPreorderDeliveryWindows.status, "OPEN"),
          sql`${breakfastPreorderDeliveryWindows.remainingCapacity} >= 1`,
        ),
      )
      .returning();
    if (!win) {
      throw new PickiError("CONFLICT", "Khung giờ giao vừa hết chỗ");
    }

    for (const item of lineItems) {
      const [updated] = await tx
        .update(breakfastPreorderMenuItems)
        .set({
          remainingCapacity: sql`CASE
            WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NULL THEN NULL
            ELSE ${breakfastPreorderMenuItems.remainingCapacity} - ${item.quantity}
          END`,
          status: sql`CASE
            WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NOT NULL
              AND ${breakfastPreorderMenuItems.remainingCapacity} - ${item.quantity} <= 0
            THEN 'SOLD_OUT'
            ELSE ${breakfastPreorderMenuItems.status}
          END`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(breakfastPreorderMenuItems.id, item.menuItemId),
            eq(breakfastPreorderMenuItems.status, "ACTIVE"),
            sql`(
              ${breakfastPreorderMenuItems.remainingCapacity} IS NULL
              OR ${breakfastPreorderMenuItems.remainingCapacity} >= ${item.quantity}
            )`,
          ),
        )
        .returning();
      if (!updated) {
        throw new PickiError("CONFLICT", `Hết suất: ${item.name}`);
      }
    }
  }

  private async restoreBreakfastCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    order: typeof orders.$inferSelect,
  ) {
    if (order.breakfastDeliveryWindowId) {
      await tx
        .update(breakfastPreorderDeliveryWindows)
        .set({
          remainingCapacity: sql`${breakfastPreorderDeliveryWindows.remainingCapacity} + 1`,
          status: sql`CASE WHEN ${breakfastPreorderDeliveryWindows.status} = 'FULL' THEN 'OPEN' ELSE ${breakfastPreorderDeliveryWindows.status} END`,
          updatedAt: new Date(),
        })
        .where(eq(breakfastPreorderDeliveryWindows.id, order.breakfastDeliveryWindowId));
    }

    const lines = await tx
      .select({
        menuItemId: orderItems.breakfastMenuItemId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    for (const line of lines) {
      if (!line.menuItemId) continue;
      await tx
        .update(breakfastPreorderMenuItems)
        .set({
          remainingCapacity: sql`CASE
            WHEN ${breakfastPreorderMenuItems.remainingCapacity} IS NULL THEN NULL
            ELSE ${breakfastPreorderMenuItems.remainingCapacity} + ${line.quantity}
          END`,
          status: sql`CASE
            WHEN ${breakfastPreorderMenuItems.status} = 'SOLD_OUT' THEN 'ACTIVE'
            ELSE ${breakfastPreorderMenuItems.status}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(breakfastPreorderMenuItems.id, line.menuItemId));
    }
  }

  private async buildFamilyDinnerLineItems(input: OrderCheckoutInput) {
    if (!input.serviceDate || !input.deliveryWindowId) {
      throw new PickiError("VALIDATION_ERROR", "Chọn ngày giao và khung giờ");
    }

    const settings = await this.db
      .select()
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, input.providerLocationId))
      .limit(1);
    if (!settings[0]?.enabled) {
      throw new PickiError("FORBIDDEN", "Bếp chưa nhận Bữa tối ấm cúng");
    }
    const cutoff = formatTime(settings[0].cutoffTime);
    if (isPastCutoff(input.serviceDate, cutoff)) {
      throw new PickiError(
        "CONFLICT",
        `Đã qua giờ chốt đơn (${cutoff}) — thử bếp khác hoặc ngày khác`,
      );
    }

    const window = await this.db
      .select()
      .from(familyDinnerDeliveryWindows)
      .where(eq(familyDinnerDeliveryWindows.id, input.deliveryWindowId))
      .limit(1);
    const w = window[0];
    if (
      !w ||
      w.providerLocationId !== input.providerLocationId ||
      w.serviceDate !== input.serviceDate
    ) {
      throw new PickiError("VALIDATION_ERROR", "Khung giờ giao không hợp lệ");
    }
    if (w.status !== "OPEN" || w.remainingCapacity < 1) {
      throw new PickiError("CONFLICT", "Khung giờ giao đã đầy");
    }

    const menuItemIds = input.items.map((i) => i.menuItemId).filter(Boolean) as string[];
    if (menuItemIds.length !== input.items.length) {
      throw new PickiError("VALIDATION_ERROR", "Family Dinner cần menuItemId");
    }

    const rows = await this.db
      .select()
      .from(familyDinnerMenuItems)
      .where(
        sql`${familyDinnerMenuItems.id} IN (${sql.join(
          menuItemIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      );
    const byId = new Map(rows.map((r) => [r.id, r]));

    const lineItems = input.items.map((item) => {
      const row = byId.get(item.menuItemId!);
      if (!row || row.status !== "ACTIVE") {
        throw new PickiError("VALIDATION_ERROR", "Món không còn trên menu", {
          details: { menuItemId: item.menuItemId },
        });
      }
      if (row.remainingCapacity != null && row.remainingCapacity < item.quantity) {
        throw new PickiError("CONFLICT", `Hết suất: ${row.name}`);
      }
      const prepMode = item.prepMode ?? "READY_COOKED";
      if (prepMode === "SELF_COOK") {
        if (!row.allowsSelfCook || !isFamilyDinnerSelfCookCategory(row.category)) {
          throw new PickiError(
            "VALIDATION_ERROR",
            `Món «${row.name}» không hỗ trợ tự nấu`,
          );
        }
      }
      const isRice = row.category === "RICE";
      const lineTotalVnd = isRice
        ? familyDinnerRiceLineTotalVnd(row.priceVnd, item.quantity)
        : row.priceVnd * item.quantity;
      const unitPriceVnd = isRice
        ? Math.round(lineTotalVnd / item.quantity)
        : row.priceVnd;
      return {
        menuItemId: row.id,
        category: row.category,
        name: row.name,
        description:
          prepMode === "SELF_COOK"
            ? [row.description, "Khách tự nấu — giao nguyên liệu/sơ chế"].filter(Boolean).join(" · ")
            : row.description,
        unitPriceVnd,
        quantity: item.quantity,
        lineTotalVnd,
        recipeVersionId: row.recipeVersionId,
        prepMode,
      };
    });

    const meal = validateFamilyDinnerBaseMeal(
      lineItems.map((l) => ({ category: l.category, quantity: l.quantity })),
    );
    if (!meal.ok) {
      throw new PickiError(
        "VALIDATION_ERROR",
        `Mâm chưa đủ nhóm: ${meal.missing.join(", ")} (cần MAIN, SIDE, VEGETABLE, SOUP)`,
      );
    }

    const subtotalVnd = lineItems.reduce((s, i) => s + i.lineTotalVnd, 0);
    const portionCount = lineItems.reduce((s, i) => s + i.quantity, 0);
    return { lineItems, subtotalVnd, portionCount };
  }

  private async reserveFamilyDinnerCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    deliveryWindowId: string,
    lineItems: { menuItemId: string; quantity: number; name: string }[],
  ) {
    const [win] = await tx
      .update(familyDinnerDeliveryWindows)
      .set({
        remainingCapacity: sql`${familyDinnerDeliveryWindows.remainingCapacity} - 1`,
        status: sql`CASE WHEN ${familyDinnerDeliveryWindows.remainingCapacity} - 1 <= 0 THEN 'FULL' ELSE ${familyDinnerDeliveryWindows.status} END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(familyDinnerDeliveryWindows.id, deliveryWindowId),
          eq(familyDinnerDeliveryWindows.status, "OPEN"),
          sql`${familyDinnerDeliveryWindows.remainingCapacity} >= 1`,
        ),
      )
      .returning();
    if (!win) {
      throw new PickiError("CONFLICT", "Khung giờ giao vừa hết chỗ");
    }

    for (const item of lineItems) {
      const [updated] = await tx
        .update(familyDinnerMenuItems)
        .set({
          remainingCapacity: sql`CASE
            WHEN ${familyDinnerMenuItems.remainingCapacity} IS NULL THEN NULL
            ELSE ${familyDinnerMenuItems.remainingCapacity} - ${item.quantity}
          END`,
          status: sql`CASE
            WHEN ${familyDinnerMenuItems.remainingCapacity} IS NOT NULL
              AND ${familyDinnerMenuItems.remainingCapacity} - ${item.quantity} <= 0
            THEN 'SOLD_OUT'
            ELSE ${familyDinnerMenuItems.status}
          END`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(familyDinnerMenuItems.id, item.menuItemId),
            eq(familyDinnerMenuItems.status, "ACTIVE"),
            sql`(
              ${familyDinnerMenuItems.remainingCapacity} IS NULL
              OR ${familyDinnerMenuItems.remainingCapacity} >= ${item.quantity}
            )`,
          ),
        )
        .returning();
      if (!updated) {
        throw new PickiError("CONFLICT", `Hết suất: ${item.name}`);
      }
    }
  }

  private async buildLateDinnerQuote(input: OrderCheckoutInput) {
    if (!input.lateDinnerOfferId) {
      throw new PickiError("VALIDATION_ERROR", "Thiếu lateDinnerOfferId");
    }
    const quantity = input.items.reduce((s, i) => s + i.quantity, 0);
    if (quantity < 1) {
      throw new PickiError("VALIDATION_ERROR", "Số mâm phải ≥ 1");
    }

    const offerRows = await this.db
      .select()
      .from(lateDinnerOffers)
      .where(eq(lateDinnerOffers.id, input.lateDinnerOfferId))
      .limit(1);
    const offer = offerRows[0];
    if (!offer || offer.providerLocationId !== input.providerLocationId) {
      throw new PickiError("NOT_FOUND", "Mâm tối muộn không tồn tại");
    }
    if (offer.status !== "ACTIVE" || offer.remainingCapacity < quantity) {
      throw new PickiError("CONFLICT", "Mâm tối muộn đã hết");
    }

    return {
      offerId: offer.id,
      title: offer.title,
      serviceDate: offer.serviceDate,
      unitPriceVnd: offer.priceVnd,
      quantity,
      subtotalVnd: offer.priceVnd * quantity,
      productionBatchId: offer.productionBatchId,
    };
  }

  private async reserveLateDinnerCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    quote: Awaited<ReturnType<OrdersService["buildLateDinnerQuote"]>>,
  ) {
    const [offer] = await tx
      .update(lateDinnerOffers)
      .set({
        remainingCapacity: sql`${lateDinnerOffers.remainingCapacity} - ${quote.quantity}`,
        status: sql`CASE WHEN ${lateDinnerOffers.remainingCapacity} - ${quote.quantity} <= 0 THEN 'SOLD_OUT' ELSE ${lateDinnerOffers.status} END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(lateDinnerOffers.id, quote.offerId),
          eq(lateDinnerOffers.status, "ACTIVE"),
          sql`${lateDinnerOffers.remainingCapacity} >= ${quote.quantity}`,
        ),
      )
      .returning();
    if (!offer) {
      throw new PickiError("CONFLICT", "Mâm tối muộn vừa hết chỗ");
    }

    // Track sold late portions; remaining was soft-reserved at offer create.
    if (quote.productionBatchId) {
      const lines = await tx
        .select()
        .from(lateDinnerOfferItems)
        .where(eq(lateDinnerOfferItems.offerId, quote.offerId));
      for (const line of lines) {
        const sold = line.quantityPerTray * quote.quantity;
        await tx
          .update(familyDinnerProductionItemTotals)
          .set({
            lateQuantity: sql`${familyDinnerProductionItemTotals.lateQuantity} + ${sold}`,
          })
          .where(
            and(
              eq(familyDinnerProductionItemTotals.productionBatchId, quote.productionBatchId),
              eq(familyDinnerProductionItemTotals.menuItemId, line.menuItemId),
            ),
          );
      }
    }
  }

  private async restoreFamilyDinnerCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    order: typeof orders.$inferSelect,
  ) {
    if (order.deliveryWindowId) {
      await tx
        .update(familyDinnerDeliveryWindows)
        .set({
          remainingCapacity: sql`${familyDinnerDeliveryWindows.remainingCapacity} + 1`,
          status: sql`CASE WHEN ${familyDinnerDeliveryWindows.status} = 'FULL' THEN 'OPEN' ELSE ${familyDinnerDeliveryWindows.status} END`,
          updatedAt: new Date(),
        })
        .where(eq(familyDinnerDeliveryWindows.id, order.deliveryWindowId));
    }

    const lines = await tx
      .select({
        menuItemId: orderItems.familyDinnerMenuItemId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    for (const line of lines) {
      if (!line.menuItemId) continue;
      await tx
        .update(familyDinnerMenuItems)
        .set({
          remainingCapacity: sql`CASE
            WHEN ${familyDinnerMenuItems.remainingCapacity} IS NULL THEN NULL
            ELSE ${familyDinnerMenuItems.remainingCapacity} + ${line.quantity}
          END`,
          status: sql`CASE
            WHEN ${familyDinnerMenuItems.status} = 'SOLD_OUT' THEN 'ACTIVE'
            ELSE ${familyDinnerMenuItems.status}
          END`,
          updatedAt: new Date(),
        })
        .where(eq(familyDinnerMenuItems.id, line.menuItemId));
    }
  }

  private async restoreLateDinnerCapacity(
    tx: Parameters<Parameters<PickiDb["transaction"]>[0]>[0],
    order: typeof orders.$inferSelect,
  ) {
    if (!order.lateDinnerOfferId) return;
    const qty =
      (
        await tx
          .select({ quantity: orderItems.quantity })
          .from(orderItems)
          .where(eq(orderItems.orderId, order.id))
          .limit(1)
      )[0]?.quantity ?? 0;
    if (qty < 1) return;

    const [offer] = await tx
      .update(lateDinnerOffers)
      .set({
        remainingCapacity: sql`${lateDinnerOffers.remainingCapacity} + ${qty}`,
        status: sql`CASE WHEN ${lateDinnerOffers.status} = 'SOLD_OUT' THEN 'ACTIVE' ELSE ${lateDinnerOffers.status} END`,
        updatedAt: new Date(),
      })
      .where(eq(lateDinnerOffers.id, order.lateDinnerOfferId))
      .returning();
    if (!offer?.productionBatchId) return;

    // Undo lateQuantity only — production remaining stays reserved on the offer pool.
    const lines = await tx
      .select()
      .from(lateDinnerOfferItems)
      .where(eq(lateDinnerOfferItems.offerId, order.lateDinnerOfferId));

    for (const line of lines) {
      const back = line.quantityPerTray * qty;
      await tx
        .update(familyDinnerProductionItemTotals)
        .set({
          lateQuantity: sql`GREATEST(${familyDinnerProductionItemTotals.lateQuantity} - ${back}, 0)`,
        })
        .where(
          and(
            eq(familyDinnerProductionItemTotals.productionBatchId, offer.productionBatchId),
            eq(familyDinnerProductionItemTotals.menuItemId, line.menuItemId),
          ),
        );
    }
  }

  private async buildLineItems(
    providerLocationId: string,
    items: CreateOrderInput["items"],
  ) {
    const menu = await listLocationMenu(this.sql, providerLocationId);
    const menuById = new Map(menu.map((m) => [m.offering_id, m]));

    const lineItems = items.map((item) => {
      if (!item.offeringId) {
        throw new PickiError("VALIDATION_ERROR", "offeringId required");
      }
      const offering = menuById.get(item.offeringId);
      if (!offering) {
        throw new PickiError("VALIDATION_ERROR", "Invalid offering for this location", {
          details: { offeringId: item.offeringId },
        });
      }
      const isReferenceOnly =
        offering.pricing_kind === "QUOTE_REQUIRED" ||
        offering.pricing_kind === "CONTACT" ||
        offering.pricing_kind === "FROM";
      const lineTotal = isReferenceOnly ? 0 : offering.amount_vnd * item.quantity;
      return {
        offeringId: item.offeringId,
        name: offering.name,
        description: offering.description,
        unitPriceVnd: offering.amount_vnd,
        quantity: item.quantity,
        lineTotalVnd: lineTotal,
        estimatedDays: offering.estimated_days,
        fulfillmentMode: offering.fulfillment_mode,
      };
    });

    const subtotalVnd = lineItems.reduce((sum, i) => sum + i.lineTotalVnd, 0);
    const fulfillmentModes = new Set(
      lineItems.map((i) => i.fulfillmentMode).filter(Boolean) as string[],
    );
    return { lineItems, subtotalVnd, fulfillmentModes };
  }

  private async computeCanCancel(order: typeof orders.$inferSelect): Promise<boolean> {
    if (order.productionLockedAt) return false;
    if (
      !canCustomerCancel(
        order.status,
        order.serviceVertical as "FOOD" | "LAUNDRY",
        order.laundryPickupMode as "HOME_PICKUP" | "SHOP_DROP_OFF" | "ON_SITE" | null,
      )
    ) {
      return false;
    }
    // Unpaid/paid preorders after batch lock: hide cancel even if productionLockedAt null.
    if (order.orderKind === "FAMILY_DINNER" && order.serviceDate) {
      const batch = await this.db
        .select({ status: familyDinnerProductionBatches.status })
        .from(familyDinnerProductionBatches)
        .where(
          and(
            eq(familyDinnerProductionBatches.providerLocationId, order.providerLocationId),
            eq(familyDinnerProductionBatches.serviceDate, order.serviceDate),
          ),
        )
        .limit(1);
      if (batch[0]?.status === "LOCKED") return false;
    }
    return true;
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
      providerBrandName: await loadProviderBrand(this.db, order.providerLocationId),
      zoneId: order.zoneId,
      providerLocationId: order.providerLocationId,
      status: order.status,
      paymentMode: order.paymentMode,
      orderKind: order.orderKind ?? "STANDARD",
      serviceDate: order.serviceDate ?? null,
      deliveryWindowId: order.deliveryWindowId ?? null,
      breakfastDeliveryWindowId: order.breakfastDeliveryWindowId ?? null,
      deliveryWindow: await loadOrderDeliveryWindow(this.db, order),
      lateDinnerOfferId: order.lateDinnerOfferId ?? null,
      productionLockedAt: order.productionLockedAt?.toISOString() ?? null,
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
        estimatedDays: i.estimatedDays,
        menuItemId: i.familyDinnerMenuItemId ?? i.breakfastMenuItemId,
        category: i.familyDinnerCategory,
        prepMode: i.prepMode,
      })),
      createdAt: order.createdAt.toISOString(),
      canCancel: await this.computeCanCancel(order),
      serviceVertical: order.serviceVertical,
      laundryPickupMode: order.laundryPickupMode,
      ...orderHandoffFields(order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId),
      contacts: await loadOrderContacts(this.db, order),
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
