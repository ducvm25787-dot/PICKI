import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, isNotNull, lt, or } from "drizzle-orm";
import {
  isCookFirstFoodOrder,
  familyDinnerProviderSettings,
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
import {
  loadOrderContacts,
  loadProviderBrand,
  loadRunnerSummary,
  orderHandoffFields,
} from "../orders/order-enrichment.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { RunnerDispatchService } from "../runner/runner-dispatch.service.js";
import { formatTime, isPastCutoff } from "../family-dinner/family-dinner.service.js";
import type { z } from "zod";
import type { providerOrderActionSchema, updateLiveStatusSchema } from "./dto.js";

@Injectable()
export class ProviderService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(RunnerDispatchService) private readonly runnerDispatch: RunnerDispatchService,
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
      providerType: string;
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
          providerType: r.provider.providerType,
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
          providerType: r.provider.providerType,
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

    const providerBrandName = await loadProviderBrand(this.db, locationId);
    const zoneRow = rows[0]
      ? await this.runnerDispatch.loadZoneFees(rows[0].zoneId)
      : null;

    const fdSettings = await this.db
      .select({
        cutoffTime: familyDinnerProviderSettings.cutoffTime,
        enabled: familyDinnerProviderSettings.enabled,
      })
      .from(familyDinnerProviderSettings)
      .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
      .limit(1);
    const familyDinnerCutoffTime = fdSettings[0]
      ? formatTime(fdSettings[0].cutoffTime)
      : null;

    const ordersOut = await Promise.all(
      rows.map(async (raw) => {
        const o = await this.ensureRunnerSought(raw);
        const runnerLeg = o.serviceVertical === "LAUNDRY" ? "RETURN" : "INBOUND";
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          providerBrandName,
          status: o.status,
          serviceVertical: o.serviceVertical,
          orderKind: o.orderKind ?? "STANDARD",
          serviceDate: o.serviceDate ?? null,
          laundryPickupMode: o.laundryPickupMode,
          subtotalVnd: o.subtotalVnd,
          deliveryFeeVnd: o.deliveryFeeVnd,
          runnerFeeVnd: this.runnerDispatch.runnerFeeVnd(o, runnerLeg, zoneRow),
          totalVnd: o.totalVnd,
          paymentMode: o.paymentMode,
          delivery: {
            building: o.deliveryBuilding,
            apartment: o.deliveryApartment,
          },
          createdAt: o.createdAt.toISOString(),
          ...orderHandoffFields(o),
          runner: await loadRunnerSummary(this.db, o.runnerUserId),
          contacts: await loadOrderContacts(this.db, o),
          items: await this.db
            .select()
            .from(orderItems)
            .where(eq(orderItems.orderId, o.id)),
        };
      }),
    );

    return { orders: ordersOut, familyDinnerCutoffTime };
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

    const providerBrandName = await loadProviderBrand(this.db, locationId);

    const ordersOut = await Promise.all(
      rows.map(async (o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        providerBrandName,
        status: o.status,
        subtotalVnd: o.subtotalVnd,
        deliveryFeeVnd: o.deliveryFeeVnd,
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

  async dailyRunnerStats(userId: string, locationId: string, date?: string) {
    await this.assertLocationAccess(userId, locationId);

    const { dayStart, dayEnd, dateLabel } = parseVnDayRange(date);

    const delivered = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          inArray(orders.status, ["DELIVERED", "COMPLETED"]),
          gte(orders.updatedAt, dayStart),
          lt(orders.updatedAt, dayEnd),
        ),
      )
      .orderBy(desc(orders.updatedAt));

    const inProgress = await this.db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.providerLocationId, locationId),
          or(
            and(
              eq(orders.serviceVertical, "FOOD"),
              inArray(orders.status, ["RUNNER_ASSIGNED", "PICKED_UP", "DELIVERING"]),
            ),
            and(
              eq(orders.serviceVertical, "LAUNDRY"),
              inArray(orders.status, [
                "RETURN_RUNNER_ASSIGNED",
                "RETURN_PICKED_UP",
                "RETURN_DELIVERING",
              ]),
            ),
          ),
          isNotNull(orders.runnerUserId),
        ),
      )
      .orderBy(desc(orders.updatedAt));

    const sumFee = (rows: (typeof delivered)[number][]) =>
      rows.reduce((sum, o) => sum + o.deliveryFeeVnd, 0);

    return {
      date: dateLabel,
      locationId,
      deliveredOrderCount: delivered.length,
      totalDeliveryFeeVnd: sumFee(delivered),
      inProgressOrderCount: inProgress.length,
      inProgressDeliveryFeeVnd: sumFee(inProgress),
      note: "Quán tự trả runner theo số liệu này — Picki không chia payout V1.",
      deliveredOrders: await Promise.all(
        delivered.map(async (o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          deliveryFeeVnd: o.deliveryFeeVnd,
          totalVnd: o.totalVnd,
          completedAt: o.updatedAt.toISOString(),
          runner: await loadRunnerSummary(this.db, o.runnerUserId),
        })),
      ),
      inProgressOrders: await Promise.all(
        inProgress.map(async (o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          deliveryFeeVnd: o.deliveryFeeVnd,
          status: o.status,
          runner: await loadRunnerSummary(this.db, o.runnerUserId),
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

    if (order[0].serviceVertical === "LAUNDRY") {
      return this.applyLaundryOrderAction(userId, order[0], input);
    }

    if (input.action === "accept") {
      if (order[0].paymentMode === "PAY_ON_PICKI" && order[0].status === "CREATED") {
        throw new PickiError("FORBIDDEN", "Order awaiting online payment");
      }
      if (isCookFirstFoodOrder(order[0])) {
        if (order[0].status === "PROVIDER_ACCEPTED") {
          return this.foodOrderActionDto(order[0]);
        }
        const result = await this.transitions.transition(
          orderId,
          "PROVIDER_ACCEPTED",
          userId,
          "Provider: accept",
        );
        await this.db
          .update(orders)
          .set({
            runnerUserId: null,
            runnerSoughtAt: null,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId));
        const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
        return this.foodOrderActionDto(refreshed[0] ?? result.order);
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

    if (input.action === "staff_deliver") {
      return this.providerStaffDeliverFood(userId, order[0]);
    }

    if (input.action === "complete") {
      return this.providerCompleteStaffDeliver(userId, order[0]);
    }

    if (input.action === "preparing") {
      if (isCookFirstFoodOrder(order[0])) {
        if (order[0].status !== "PROVIDER_ACCEPTED" && order[0].status !== "RUNNER_ASSIGNED") {
          throw new PickiError("FORBIDDEN", "Nhận đơn trước khi bắt đầu nấu");
        }
        // Family Dinner: chỉ nấu sau giờ chốt nhận đơn (Late Dinner được nấu ngay).
        if (order[0].orderKind === "FAMILY_DINNER" && order[0].serviceDate) {
          const settings = await this.db
            .select({ cutoffTime: familyDinnerProviderSettings.cutoffTime })
            .from(familyDinnerProviderSettings)
            .where(
              eq(
                familyDinnerProviderSettings.providerLocationId,
                order[0].providerLocationId,
              ),
            )
            .limit(1);
          const cutoff = formatTime(settings[0]?.cutoffTime ?? "16:00");
          if (!isPastCutoff(order[0].serviceDate, cutoff)) {
            throw new PickiError(
              "FORBIDDEN",
              `Chỉ bắt đầu nấu sau giờ chốt nhận đơn (${cutoff})`,
            );
          }
        }
      } else {
        if (order[0].status !== "RUNNER_ASSIGNED") {
          throw new PickiError("FORBIDDEN", "Runner phải nhận đơn trước khi bắt đầu nấu");
        }
        if (!order[0].runnerUserId) {
          throw new PickiError("FORBIDDEN", "Chưa có runner nhận đơn");
        }
      }
    }

    if (input.action === "ready" && order[0].status !== "PREPARING") {
      throw new PickiError("FORBIDDEN", "Order must be preparing before marking ready");
    }

    const toStatus = providerActionToStatus(input.action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid provider action");
    }

    if (input.action === "reject" && !input.rejectReason?.trim()) {
      throw new PickiError("VALIDATION_ERROR", "Vui lòng chọn hoặc nhập lý do từ chối");
    }

    const note =
      input.action === "reject"
        ? `Provider rejected: ${input.rejectReason!.trim()}`
        : `Provider: ${input.action}`;

    const result = await this.transitions.transition(orderId, toStatus, userId, note);

    const etaPatch = providerEtaPatch(input.action);
    if (etaPatch) {
      await this.db.update(orders).set(etaPatch).where(eq(orders.id, orderId));
    }

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const latest = refreshed[0] ?? result.order;

    return this.foodOrderActionDto(latest);
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
        return this.laundryOrderDto(order);
      }
      const result = await this.transitions.transition(
        order.id,
        "PROVIDER_ACCEPTED",
        userId,
        "Laundry: accept",
      );
      await this.db
        .update(orders)
        .set({
          runnerUserId: null,
          runnerSoughtAt: null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return this.laundryOrderDto(refreshed[0] ?? result.order);
    }

    if (input.action === "find_runner") {
      throw new PickiError("FORBIDDEN", "Đơn giặt không dùng runner lấy đồ — nhân viên tiệm đến lấy");
    }

    if (input.action === "find_return_runner") {
      return this.providerFindReturnRunner(userId, order);
    }

    if (input.action === "cancel_return_runner") {
      if (order.status !== "READY_FOR_RETURN") {
        throw new PickiError("FORBIDDEN", "Chỉ hủy gọi runner khi đồ đã sẵn sàng giao lại");
      }
      if (!order.runnerSoughtAt) {
        throw new PickiError("FORBIDDEN", "Chưa gọi runner cho đơn này");
      }
      if (order.runnerUserId) {
        throw new PickiError("FORBIDDEN", "Runner đã nhận đơn — không thể hủy gọi");
      }
      await this.runnerDispatch.cancelDispatch(order.id, { clearLaundryReturnFee: true });
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return this.laundryOrderDto(refreshed[0] ?? order);
    }

    if (input.action === "collected") {
      if (order.laundryPickupMode !== "HOME_PICKUP") {
        throw new PickiError("FORBIDDEN", "Chỉ áp dụng khi lấy đồ tại nhà khách");
      }
      if (order.status !== "PROVIDER_ACCEPTED") {
        throw new PickiError("FORBIDDEN", "Đơn chưa ở trạng thái chờ lấy đồ");
      }
      const estimatedReadyAt = await this.laundryEstimatedReadyAt(order.id);
      const result = await this.transitions.transition(
        order.id,
        "AT_SHOP",
        userId,
        "Laundry: collected from customer",
      );
      await this.db
        .update(orders)
        .set({
          estimatedReadyAt,
          runnerUserId: null,
          runnerSoughtAt: null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return this.laundryOrderDto(refreshed[0] ?? result.order);
    }

    if (input.action === "received") {
      if (order.laundryPickupMode !== "SHOP_DROP_OFF") {
        throw new PickiError("FORBIDDEN", "Chỉ áp dụng khi khách tự mang đồ tới tiệm");
      }
      if (order.status !== "PROVIDER_ACCEPTED") {
        throw new PickiError("FORBIDDEN", "Đơn chưa ở trạng thái chờ nhận đồ tại tiệm");
      }
      const estimatedReadyAt = await this.laundryEstimatedReadyAt(order.id);
      const result = await this.transitions.transition(
        order.id,
        "AT_SHOP",
        userId,
        "Laundry: received at shop",
      );
      await this.db
        .update(orders)
        .set({
          estimatedReadyAt,
          runnerUserId: null,
          runnerSoughtAt: null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
      return this.laundryOrderDto(refreshed[0] ?? result.order);
    }

    if (input.action === "staff_deliver") {
      if (order.laundryPickupMode === "ON_SITE") {
        throw new PickiError("FORBIDDEN", "Dịch vụ tại nhà dùng Hoàn thành");
      }
      if (order.status !== "READY_FOR_RETURN") {
        throw new PickiError("FORBIDDEN", "Chỉ tự giao khi đồ đã sẵn sàng trả");
      }
      if (order.runnerSoughtAt && !order.runnerUserId) {
        await this.runnerDispatch.cancelDispatch(order.id, { clearLaundryReturnFee: true });
      }
    }

    if (input.action === "complete") {
      if (order.laundryPickupMode === "ON_SITE") {
        if (order.status !== "PROCESSING") {
          throw new PickiError("FORBIDDEN", "Chỉ hoàn thành dịch vụ tại nhà khi đang xử lý");
        }
      } else if (order.status === "RETURN_DELIVERING" && !order.runnerUserId) {
        // Staff self-deliver — confirm after handoff to customer
      } else {
        throw new PickiError("FORBIDDEN", "Chỉ hoàn thành sau khi đã tự giao về khách");
      }
    }

    if (input.action === "reject" && !input.rejectReason?.trim()) {
      throw new PickiError("VALIDATION_ERROR", "Vui lòng chọn hoặc nhập lý do từ chối");
    }

    if (input.action === "processing") {
      if (order.laundryPickupMode === "ON_SITE") {
        if (order.status !== "PROVIDER_ACCEPTED") {
          throw new PickiError("FORBIDDEN", "Phải nhận đơn trước khi bắt đầu dịch vụ tại nhà");
        }
      } else if (order.status !== "AT_SHOP") {
        throw new PickiError("FORBIDDEN", "Phải nhận đồ về tiệm trước khi giặt");
      }
    }

    if (["preparing", "ready", "handoff"].includes(input.action)) {
      throw new PickiError("FORBIDDEN", "Đơn giặt không dùng luồng nấu/bàn giao quán ăn");
    }

    const toStatus = providerActionToStatus(input.action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid laundry action");
    }

    const note =
      input.action === "reject"
        ? `Provider rejected: ${input.rejectReason!.trim()}`
        : `Laundry: ${input.action}`;

    const result = await this.transitions.transition(order.id, toStatus, userId, note);
    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.laundryOrderDto(refreshed[0] ?? result.order);
  }

  private async laundryEstimatedReadyAt(orderId: string): Promise<Date> {
    const items = await this.db
      .select({ estimatedDays: orderItems.estimatedDays })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const maxDays = items.reduce((max, i) => Math.max(max, i.estimatedDays ?? 1), 1);
    return new Date(Date.now() + maxDays * 86_400_000);
  }

  private async laundryOrderDto(order: typeof orders.$inferSelect) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      deliveryFeeVnd: order.deliveryFeeVnd,
      ...orderHandoffFields(order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId ?? null),
      contacts: await loadOrderContacts(this.db, order),
    };
  }

  private async providerFindReturnRunner(userId: string, order: typeof orders.$inferSelect) {
    if (order.status !== "READY_FOR_RETURN") {
      throw new PickiError("FORBIDDEN", "Chỉ tìm runner giao lại khi đồ đã sẵn sàng");
    }
    if (order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "Runner đã nhận đơn này");
    }

    await this.runnerDispatch.dispatch(order, "RETURN", userId);

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.laundryOrderDto(refreshed[0] ?? order);
  }

  private async providerFindRunner(userId: string, order: typeof orders.$inferSelect) {
    const cookFirst = isCookFirstFoodOrder(order);
    if (cookFirst) {
      if (order.status !== "READY") {
        throw new PickiError("FORBIDDEN", "Nấu xong (sẵn sàng giao) rồi mới tìm runner");
      }
    } else if (order.status !== "PROVIDER_ACCEPTED") {
      throw new PickiError("FORBIDDEN", "Chỉ tìm runner sau khi đã nhận đơn");
    }
    if (order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "Runner đã nhận đơn này");
    }

    await this.runnerDispatch.dispatch(order, "INBOUND", userId);

    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: refreshed[0]?.status ?? order.status,
      deliveryFeeVnd: refreshed[0]?.deliveryFeeVnd ?? order.deliveryFeeVnd,
      ...orderHandoffFields(refreshed[0] ?? order),
      runner: null,
    };
  }

  /** Family Dinner: bếp tự sắp xếp giao — không dùng runner Picki. */
  private async providerStaffDeliverFood(userId: string, order: typeof orders.$inferSelect) {
    if (!isCookFirstFoodOrder(order)) {
      throw new PickiError("FORBIDDEN", "Chỉ dùng Tự giao cho bữa tối ấm cúng");
    }
    if (order.status !== "READY") {
      throw new PickiError("FORBIDDEN", "Nấu xong rồi mới tự giao");
    }
    if (order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "Đã có runner — dùng bàn giao runner");
    }
    if (order.runnerSoughtAt) {
      await this.runnerDispatch.cancelDispatch(order.id);
    }

    const result = await this.transitions.transition(
      order.id,
      "DELIVERING",
      userId,
      "Provider: staff_deliver",
    );
    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.foodOrderActionDto(refreshed[0] ?? result.order);
  }

  private async providerCompleteStaffDeliver(userId: string, order: typeof orders.$inferSelect) {
    if (!isCookFirstFoodOrder(order)) {
      throw new PickiError("FORBIDDEN", "Invalid complete action");
    }
    if (order.status !== "DELIVERING" || order.runnerUserId) {
      throw new PickiError("FORBIDDEN", "Chỉ hoàn thành sau khi đã tự giao về khách");
    }

    const result = await this.transitions.transition(
      order.id,
      "DELIVERED",
      userId,
      "Provider: complete staff deliver",
    );
    const refreshed = await this.db.select().from(orders).where(eq(orders.id, order.id)).limit(1);
    return this.foodOrderActionDto(refreshed[0] ?? result.order);
  }

  private async foodOrderActionDto(order: typeof orders.$inferSelect) {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      orderKind: order.orderKind ?? "STANDARD",
      deliveryFeeVnd: order.deliveryFeeVnd,
      ...orderHandoffFields(order),
      runner: await loadRunnerSummary(this.db, order.runnerUserId ?? null),
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
          actorUserId: userId,
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
      estimatedWaitMinutes: row[0]?.estimatedWaitMinutes ?? null,
      updatedAt: row[0]?.updatedAt?.toISOString() ?? null,
    };
  }

  async updateLiveStatus(
    userId: string,
    locationId: string,
    input: z.infer<typeof updateLiveStatusSchema>,
  ) {
    await this.assertLocationAccess(userId, locationId);

    const patch = {
      status: input.status,
      message: input.message ?? null,
      estimatedWaitMinutes:
        input.estimatedWaitMinutes !== undefined ? input.estimatedWaitMinutes : undefined,
      updatedAt: new Date(),
    };

    await this.db
      .insert(providerLiveStatus)
      .values({
        providerLocationId: locationId,
        status: input.status,
        message: input.message ?? null,
        estimatedWaitMinutes: input.estimatedWaitMinutes ?? null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: providerLiveStatus.providerLocationId,
        set: {
          status: patch.status,
          message: patch.message,
          ...(input.estimatedWaitMinutes !== undefined
            ? { estimatedWaitMinutes: input.estimatedWaitMinutes }
            : {}),
          updatedAt: patch.updatedAt,
        },
      });

    return {
      locationId,
      status: input.status,
      estimatedWaitMinutes: input.estimatedWaitMinutes ?? null,
    };
  }

  /** Pilot food STANDARD: đơn đã nhận nhưng chưa tìm runner → tự bổ sung khi load list.
   * Family Dinner / Late Dinner: nấu trước — không auto tìm runner. */
  private async ensureRunnerSought(order: typeof orders.$inferSelect) {
    if (order.serviceVertical === "LAUNDRY" || isCookFirstFoodOrder(order)) {
      return order;
    }
    if (
      order.status !== "PROVIDER_ACCEPTED" ||
      order.runnerUserId ||
      order.runnerSoughtAt
    ) {
      return order;
    }

    try {
      await this.runnerDispatch.dispatch(order, "INBOUND");
    } catch {
      return order;
    }

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

/** Asia/Ho_Chi_Minh calendar day → UTC range for DB filters. */
function parseVnDayRange(date?: string) {
  const label =
    date ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    throw new PickiError("VALIDATION_ERROR", "date must be YYYY-MM-DD");
  }
  const dayStart = new Date(`${label}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  return { dayStart, dayEnd, dateLabel: label };
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
