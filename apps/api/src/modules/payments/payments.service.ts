import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import { orders, paymentEvents, payments, type PickiDb } from "@picki/db";
import type { PaymentAdapter } from "@picki/shared";
import { PickiError, type PickiId, type Vnd } from "@picki/shared";
import { payosOrderCodeFromPaymentId } from "../../integrations/payments/payos.adapter.js";
import type { PickiConfig } from "../../shared/config.js";
import { PAYMENT_ADAPTER, PICKI_CONFIG, PICKI_DB } from "../../shared/tokens.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";

type IntentExtras = { checkoutUrl?: string; qrCode?: string };

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
    @Inject(PAYMENT_ADAPTER) private readonly adapter: PaymentAdapter,
  ) {}

  async createPaymentIntent(userId: string, orderId: string) {
    const order = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order[0]) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }
    if (order[0].customerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not your order");
    }
    if (order[0].paymentMode !== "PAY_ON_PICKI") {
      throw new PickiError("FORBIDDEN", "Order is not online payment");
    }
    if (!["CREATED", "PAYMENT_PENDING"].includes(order[0].status)) {
      throw new PickiError("FORBIDDEN", "Order is not payable");
    }

    const existing = await this.db
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);

    if (existing[0]?.status === "SUCCEEDED") {
      return this.formatPaymentResponse(existing[0], order[0].status);
    }

    let payment = existing[0];
    if (!payment) {
      const inserted = await this.db
        .insert(payments)
        .values({
          orderId,
          amountVnd: order[0].totalVnd,
          status: "PENDING",
          providerKind: this.adapter.providerKey,
        })
        .returning();
      payment = inserted[0];
    }

    if (!payment) {
      throw new PickiError("INTERNAL_ERROR", "Failed to create payment");
    }

    if (order[0].status === "CREATED") {
      await this.transitions.transition(orderId, "PAYMENT_PENDING", userId, "Online payment started");
    }

    let extras: IntentExtras = {};
    const existingIntent = await this.latestIntentExtras(payment.id);
    if (existingIntent.checkoutUrl || existingIntent.qrCode) {
      extras = existingIntent;
    } else if (payment.status === "PENDING") {
      const intent = await this.adapter.createIntent({
        pickiPaymentId: payment.id as PickiId,
        amountVnd: payment.amountVnd as Vnd,
        metadata: { orderId, orderNumber: order[0].orderNumber },
      });

      await this.db
        .update(payments)
        .set({ providerRef: intent.adapterReference, updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      extras = { checkoutUrl: intent.checkoutUrl, qrCode: intent.qrCode };

      await this.db.insert(paymentEvents).values({
        paymentId: payment.id,
        eventType: "INTENT_CREATED",
        payload: {
          amountVnd: payment.amountVnd,
          adapterReference: intent.adapterReference,
          checkoutUrl: intent.checkoutUrl,
          qrCode: intent.qrCode,
          orderCode:
            this.adapter.providerKey === "PAYOS" ? payosOrderCodeFromPaymentId(payment.id) : null,
        },
      });
    }

    return {
      paymentId: payment.id,
      orderId,
      amountVnd: payment.amountVnd,
      status: payment.status,
      providerKind: payment.providerKind,
      checkoutUrl: extras.checkoutUrl,
      qrCode: extras.qrCode,
      ...(this.adapter.providerKey === "DEV_STUB" && this.config.nodeEnv !== "production"
        ? { devConfirmPath: `/v1/payments/${payment.id}/dev-confirm` }
        : {}),
    };
  }

  async getPaymentStatus(userId: string, paymentId: string) {
    const row = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    const payment = row[0];
    if (!payment) {
      throw new PickiError("NOT_FOUND", "Payment not found");
    }

    const order = await this.db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    if (!order[0] || order[0].customerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not your payment");
    }

    const extras = await this.latestIntentExtras(payment.id);
    return this.formatPaymentResponse(payment, order[0].status, extras);
  }

  async devConfirm(paymentId: string, userId: string) {
    if (this.config.nodeEnv === "production") {
      throw new PickiError("FORBIDDEN", "Not available in production");
    }
    if (this.adapter.providerKey !== "DEV_STUB") {
      throw new PickiError("FORBIDDEN", "Dev confirm only for DEV_STUB");
    }

    const row = await this.db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    const payment = row[0];
    if (!payment) {
      throw new PickiError("NOT_FOUND", "Payment not found");
    }

    const order = await this.db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    if (!order[0] || order[0].customerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not your payment");
    }

    return this.markPaymentSucceeded(payment, userId, "dev-stub", `dev-confirm-${paymentId}`, {
      stub: true,
    });
  }

  async handlePayosWebhook(body: unknown) {
    if (this.adapter.providerKey !== "PAYOS") {
      throw new PickiError("FORBIDDEN", "PayOS not configured");
    }

    const parsed = await this.adapter.parseWebhook({}, body);
    const data = (parsed.raw as { data?: { orderCode?: number } }).data;
    const orderCode = data?.orderCode;
    if (orderCode == null) {
      throw new PickiError("VALIDATION_ERROR", "Missing orderCode");
    }

    const payment = await this.findPayosPayment(orderCode, parsed.providerRef);
    if (!payment) {
      throw new PickiError("NOT_FOUND", "Payment not found for webhook");
    }

    if (parsed.status === "SUCCEEDED") {
      return this.markPaymentSucceeded(
        payment,
        null,
        parsed.providerRef,
        parsed.providerEventId,
        parsed.raw,
      );
    }

    if (parsed.status === "CANCELLED" || parsed.status === "FAILED") {
      await this.recordPaymentEvent(payment.id, "FAILED", parsed.raw, parsed.providerEventId);
      await this.db
        .update(payments)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(payments.id, payment.id));

      if (payment.status !== "FAILED") {
        const orderRow = await this.db
          .select()
          .from(orders)
          .where(eq(orders.id, payment.orderId))
          .limit(1);
        if (orderRow[0]) {
          await this.transitions.transition(
            payment.orderId,
            "PAYMENT_FAILED",
            orderRow[0].customerUserId,
            "PayOS payment failed",
          );
        }
      }
    }

    return { ok: true, status: parsed.status };
  }

  private async markPaymentSucceeded(
    payment: typeof payments.$inferSelect,
    actorUserId: string | null,
    providerRef: string,
    idempotencyKey: string,
    payload: unknown,
  ) {
    if (payment.status === "SUCCEEDED") {
      const order = await this.db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: "SUCCEEDED" as const,
        orderStatus: order[0]?.status ?? "PAID",
      };
    }

    const dup = await this.db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotencyKey, idempotencyKey))
      .limit(1);
    if (dup[0]) {
      const order = await this.db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: "SUCCEEDED" as const,
        orderStatus: order[0]?.status ?? "PAID",
      };
    }

    await this.db
      .update(payments)
      .set({ status: "SUCCEEDED", providerRef, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    await this.recordPaymentEvent(payment.id, "SUCCEEDED", payload, idempotencyKey);

    const orderRow = await this.db.select().from(orders).where(eq(orders.id, payment.orderId)).limit(1);
    const payerId = actorUserId ?? orderRow[0]?.customerUserId;
    if (!payerId) {
      throw new PickiError("INTERNAL_ERROR", "Cannot resolve payment actor");
    }

    const result = await this.transitions.transition(
      payment.orderId,
      "PAID",
      payerId,
      "Payment confirmed",
    );

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      status: "SUCCEEDED" as const,
      orderStatus: result.order.status,
    };
  }

  private async findPayosPayment(orderCode: number, providerRef: string) {
    const candidates = await this.db
      .select()
      .from(payments)
      .where(
        and(eq(payments.providerKind, "PAYOS"), inArray(payments.status, ["PENDING", "PROCESSING"])),
      )
      .orderBy(desc(payments.createdAt))
      .limit(100);

    for (const p of candidates) {
      if (payosOrderCodeFromPaymentId(p.id) === orderCode) return p;
      if (p.providerRef === providerRef) return p;
    }
    return null;
  }

  private async latestIntentExtras(paymentId: string): Promise<IntentExtras> {
    const rows = await this.db
      .select()
      .from(paymentEvents)
      .where(and(eq(paymentEvents.paymentId, paymentId), eq(paymentEvents.eventType, "INTENT_CREATED")))
      .orderBy(desc(paymentEvents.createdAt))
      .limit(1);

    const payload = rows[0]?.payload as IntentExtras & { checkoutUrl?: string; qrCode?: string };
    return {
      checkoutUrl: payload?.checkoutUrl,
      qrCode: payload?.qrCode,
    };
  }

  private async recordPaymentEvent(
    paymentId: string,
    eventType: string,
    payload: unknown,
    idempotencyKey: string,
  ) {
    await this.db.insert(paymentEvents).values({
      paymentId,
      eventType,
      payload: payload as Record<string, unknown>,
      idempotencyKey,
    });
  }

  private formatPaymentResponse(
    payment: typeof payments.$inferSelect,
    orderStatus: string,
    extras: IntentExtras = {},
  ) {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      amountVnd: payment.amountVnd,
      status: payment.status,
      providerKind: payment.providerKind,
      orderStatus,
      checkoutUrl: extras.checkoutUrl,
      qrCode: extras.qrCode,
    };
  }
}
