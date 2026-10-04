import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import {
  auditLogs,
  hasPendingOffer,
  isCookFirstFoodOrder,
  loadOrderDeliveryWindow,
  scheduledPrepareState,
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
import type { runnerCredentialsSchema, runnerOrderActionSchema, updatePresenceSchema } from "./dto.js";
import {
  isRunnerDocKind,
  readRunnerDocument,
  removeRunnerDocument,
  saveRunnerDocument,
  type RunnerDocKind,
} from "./documents.js";

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

  async getCredentials(userId: string) {
    const runner = await this.requireRunner(userId);
    return this.credentialsView(runner);
  }

  async updateCredentials(userId: string, input: z.infer<typeof runnerCredentialsSchema>) {
    const runner = await this.requireRunner(userId);
    if (input.section === "cccd") {
      const [taken] = await this.db
        .select({ id: runners.id })
        .from(runners)
        .where(and(eq(runners.cccdNumber, input.cccdNumber), ne(runners.id, runner.id)))
        .limit(1);
      if (taken) throw new PickiError("CONFLICT", "CCCD này đã gắn với tài xế khác");
      const front = input.cccdFrontDataUrl
        ? await saveRunnerDocument(input.cccdFrontDataUrl)
        : runner.cccdFrontFile;
      const back = input.cccdBackDataUrl
        ? await saveRunnerDocument(input.cccdBackDataUrl)
        : runner.cccdBackFile;
      if (!front || !back) {
        throw new PickiError("VALIDATION_ERROR", "Cần ảnh mặt trước và mặt sau CCCD");
      }
      await this.db
        .update(runners)
        .set({
          cccdNumber: input.cccdNumber,
          cccdFullName: input.cccdFullName,
          cccdFrontFile: front,
          cccdBackFile: back,
          credentialsUpdatedAt: new Date(),
        })
        .where(eq(runners.id, runner.id));
      if (input.cccdFrontDataUrl) await removeRunnerDocument(runner.cccdFrontFile);
      if (input.cccdBackDataUrl) await removeRunnerDocument(runner.cccdBackFile);
    } else if (input.section === "vehicle") {
      const doc = input.vehicleDocDataUrl
        ? await saveRunnerDocument(input.vehicleDocDataUrl)
        : runner.vehicleDocFile;
      if (!doc) throw new PickiError("VALIDATION_ERROR", "Cần ảnh giấy đăng ký xe");
      await this.db
        .update(runners)
        .set({
          vehiclePlate: input.vehiclePlate.toUpperCase(),
          vehicleDocFile: doc,
          credentialsUpdatedAt: new Date(),
        })
        .where(eq(runners.id, runner.id));
      if (input.vehicleDocDataUrl) await removeRunnerDocument(runner.vehicleDocFile);
    } else {
      await this.db
        .update(runners)
        .set({
          payoutBankName: input.payoutBankName,
          payoutAccountNumber: input.payoutAccountNumber,
          payoutAccountHolder: input.payoutAccountHolder,
          credentialsUpdatedAt: new Date(),
        })
        .where(eq(runners.id, runner.id));
    }
    await this.db.insert(auditLogs).values({
      actorUserId: userId,
      action: "RUNNER_CREDENTIALS_UPDATE",
      entityType: "runner",
      entityId: runner.id,
      metadata: { section: input.section },
    });
    const [updated] = await this.db.select().from(runners).where(eq(runners.id, runner.id)).limit(1);
    if (!updated) throw new PickiError("NOT_FOUND", "Không thấy tài xế");
    return this.credentialsView(updated);
  }

  async readOwnDocument(userId: string, kind: string) {
    if (!isRunnerDocKind(kind)) throw new PickiError("NOT_FOUND", "Không thấy ảnh");
    const runner = await this.requireRunner(userId);
    const file = this.documentFile(runner, kind);
    if (!file) throw new PickiError("NOT_FOUND", "Chưa có ảnh");
    return { dataUrl: await readRunnerDocument(file) };
  }

  private async requireRunner(userId: string) {
    const [runner] = await this.db.select().from(runners).where(eq(runners.userId, userId)).limit(1);
    if (!runner) throw new PickiError("FORBIDDEN", "Runner profile not found");
    return runner;
  }

  private documentFile(
    runner: {
      cccdFrontFile: string | null;
      cccdBackFile: string | null;
      vehicleDocFile: string | null;
    },
    kind: RunnerDocKind,
  ) {
    if (kind === "cccd-front") return runner.cccdFrontFile;
    if (kind === "cccd-back") return runner.cccdBackFile;
    return runner.vehicleDocFile;
  }

  private credentialsView(runner: {
    cccdNumber: string | null;
    cccdFullName: string | null;
    cccdFrontFile: string | null;
    cccdBackFile: string | null;
    vehiclePlate: string | null;
    vehicleDocFile: string | null;
    payoutBankName: string | null;
    payoutAccountNumber: string | null;
    payoutAccountHolder: string | null;
    credentialsUpdatedAt: Date | null;
  }) {
    return {
      cccdNumber: runner.cccdNumber,
      cccdFullName: runner.cccdFullName,
      hasCccdFront: Boolean(runner.cccdFrontFile),
      hasCccdBack: Boolean(runner.cccdBackFile),
      vehiclePlate: runner.vehiclePlate,
      hasVehicleDoc: Boolean(runner.vehicleDocFile),
      payoutBankName: runner.payoutBankName,
      payoutAccountNumber: runner.payoutAccountNumber,
      payoutAccountHolder: runner.payoutAccountHolder,
      credentialsUpdatedAt: runner.credentialsUpdatedAt?.toISOString() ?? null,
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
            and(eq(orders.serviceVertical, "FOOD"), eq(orders.status, "READY")),
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
        containsAlcohol: o.containsAlcohol,
        estimatedReadyAt: o.estimatedReadyAt?.toISOString() ?? null,
        providerHandoffAt: o.providerHandoffAt?.toISOString() ?? null,
        runnerSoughtAt: o.runnerSoughtAt?.toISOString() ?? null,
        routeId: routeLink[0]?.routeId ?? null,
        deliveryWindow: await loadOrderDeliveryWindow(this.db, o),
        delivery: {
          building: o.deliveryBuilding,
          apartment: o.deliveryApartment,
          accessNote: o.deliveryAccessNote,
          runnerWaitMinutes: o.runnerWaitMinutes,
          runnerWaitFeeVnd: o.runnerWaitFeeVnd,
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

    if (input.action === "accept" || input.action === "picked_up") {
      const gate = await scheduledPrepareState(this.db, order[0]);
      if (gate.scheduled && !gate.open) {
        throw new PickiError("FORBIDDEN", gate.message || "Chưa tới giờ lấy hàng");
      }
    }

    if (input.action === "accept") {
      const isReturn =
        order[0].serviceVertical === "LAUNDRY" && order[0].status === "READY_FOR_RETURN";
      const isInbound =
        order[0].serviceVertical !== "LAUNDRY" &&
        !isCookFirstFoodOrder(order[0]) &&
        order[0].status === "PROVIDER_ACCEPTED";
      const isReadyForPickup =
        order[0].serviceVertical !== "LAUNDRY" && order[0].status === "READY";

      if (!isReturn && !isInbound && !isReadyForPickup) {
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

      if (isReadyForPickup) {
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
