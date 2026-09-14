import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { orders, paymentEvents, payments, type PickiDb } from "@picki/db";
import { PickiError } from "@picki/shared";
import type { PickiConfig } from "../../shared/config.js";
import { PICKI_CONFIG, PICKI_DB } from "../../shared/tokens.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
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
      return this.formatPayment(existing[0], order[0].status);
    }

    let payment = existing[0];
    if (!payment) {
      const inserted = await this.db
        .insert(payments)
        .values({
          orderId,
          amountVnd: order[0].totalVnd,
          status: "PENDING",
          providerKind: "DEV_STUB",
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

    await this.db.insert(paymentEvents).values({
      paymentId: payment.id,
      eventType: "INTENT_CREATED",
      payload: { amountVnd: payment.amountVnd },
    });

    return {
      paymentId: payment.id,
      orderId,
      amountVnd: payment.amountVnd,
      status: payment.status,
      ...(this.config.nodeEnv !== "production"
        ? { devConfirmPath: `/v1/payments/${payment.id}/dev-confirm` }
        : {}),
    };
  }

  async devConfirm(paymentId: string, userId: string) {
    if (this.config.nodeEnv === "production") {
      throw new PickiError("FORBIDDEN", "Not available in production");
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

    if (payment.status === "SUCCEEDED") {
      return this.formatPayment(payment, order[0].status);
    }

    await this.db
      .update(payments)
      .set({ status: "SUCCEEDED", providerRef: "dev-stub", updatedAt: new Date() })
      .where(eq(payments.id, paymentId));

    await this.db.insert(paymentEvents).values({
      paymentId,
      eventType: "SUCCEEDED",
      payload: { stub: true },
      idempotencyKey: `dev-confirm-${paymentId}`,
    });

    const result = await this.transitions.transition(
      payment.orderId,
      "PAID",
      userId,
      "Dev payment confirmed",
    );

    return {
      paymentId,
      orderId: payment.orderId,
      status: "SUCCEEDED",
      orderStatus: result.order.status,
    };
  }

  private formatPayment(payment: typeof payments.$inferSelect, orderStatus: string) {
    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      amountVnd: payment.amountVnd,
      status: payment.status,
      orderStatus,
    };
  }
}
