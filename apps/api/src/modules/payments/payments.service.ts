import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  billingPaymentEvents,
  billingPayments,
  orders,
  providerSubscriptionNotices,
  recordSubscriptionPayment,
  payosOrderCodeFor,
  payosSourceFromOrderCode,
  paymentEvents,
  payments,
  providerBillingInvoices,
  providerMembers,
  providerSubscriptionPlanPrices,
  providerSubscriptionPlans,
  providerSubscriptions,
  auditLogs,
  type PickiDb,
} from "@picki/db";
import type { PaymentAdapter } from "@picki/shared";
import { canManageProviderBilling, PickiError, type PickiId, type Vnd } from "@picki/shared";
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
      const payosOrderCode = payment.payosOrderCode ?? (await this.allocatePayosCode("ORDER"));
      if (payment.payosOrderCode == null) {
        await this.db
          .update(payments)
          .set({ payosOrderCode, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));
      }
      const intent = await this.adapter.createIntent({
        pickiPaymentId: payment.id as PickiId,
        amountVnd: payment.amountVnd as Vnd,
        metadata: { orderId, orderNumber: order[0].orderNumber, payosOrderCode },
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

    const source = payosSourceFromOrderCode(orderCode);
    if (source === "PROVIDER_BILLING") {
      return this.handleBillingWebhook(orderCode, parsed);
    }

    const payment =
      source === "ORDER"
        ? (
            await this.db
              .select()
              .from(payments)
              .where(eq(payments.payosOrderCode, orderCode))
              .limit(1)
          )[0]
        : await this.findPayosPayment(orderCode, parsed.providerRef);
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

  private async allocatePayosCode(source: "ORDER" | "PROVIDER_BILLING") {
    const result = await this.db.execute(sql`select nextval('payos_order_code_seq')::text as n`);
    const row = (Array.isArray(result) ? result[0] : null) as { n?: string } | null;
    const sequence = Number(row?.n);
    return payosOrderCodeFor(source, sequence);
  }

  private async handleBillingWebhook(
    orderCode: number,
    parsed: { status: string; providerRef: string; providerEventId: string; raw: unknown },
  ) {
    const [payment] = await this.db
      .select()
      .from(billingPayments)
      .where(eq(billingPayments.payosOrderCode, orderCode))
      .limit(1);
    if (!payment) throw new PickiError("NOT_FOUND", "Billing payment not found");
    if (parsed.status === "SUCCEEDED") {
      await this.markBillingSucceeded(payment, parsed.providerRef, parsed.providerEventId, parsed.raw);
    } else if (parsed.status === "FAILED" || parsed.status === "CANCELLED") {
      await this.db.insert(billingPaymentEvents).values({
        billingPaymentId: payment.id,
        eventType: "FAILED",
        payload: parsed.raw as Record<string, unknown>,
        idempotencyKey: parsed.providerEventId,
      });
      await this.db
        .update(billingPayments)
        .set({ status: "FAILED", updatedAt: new Date() })
        .where(eq(billingPayments.id, payment.id));
    }
    return { ok: true, status: parsed.status, source: "PROVIDER_BILLING" as const };
  }

  async markBillingSucceeded(
    payment: typeof billingPayments.$inferSelect,
    providerRef: string,
    idempotencyKey: string,
    payload: unknown,
  ) {
    if (payment.status === "SUCCEEDED") return { paymentId: payment.id, status: "SUCCEEDED" as const };
    try {
      const recorded = await recordSubscriptionPayment(this.db, {
        paymentId: payment.id,
        invoiceId: payment.invoiceId,
        amountVnd: payment.amountVnd,
        providerRef,
        idempotencyKey,
        payload,
      });
      return { paymentId: payment.id, status: "SUCCEEDED" as const, expiresAt: recorded.expiresAt };
    } catch (err) {
      if (err instanceof Error && err.message === "Invoice not found") {
        throw new PickiError("NOT_FOUND", "Invoice not found");
      }
      if (err instanceof Error && err.message === "Subscription not found") {
        throw new PickiError("NOT_FOUND", "Subscription not found");
      }
      throw err;
    }
  }

  async listPlans() {
    const plans = await this.db
      .select()
      .from(providerSubscriptionPlans)
      .where(eq(providerSubscriptionPlans.active, true));
    const prices = await this.db
      .select()
      .from(providerSubscriptionPlanPrices)
      .where(eq(providerSubscriptionPlanPrices.active, true));
    return { plans, prices };
  }

  async subscriptionState(userId: string, providerId: string) {
    const member = await this.billingMember(userId, providerId);
    const [subscription] = await this.db
      .select()
      .from(providerSubscriptions)
      .where(eq(providerSubscriptions.providerId, providerId))
      .orderBy(desc(providerSubscriptions.createdAt))
      .limit(1);
    const invoices = subscription
      ? await this.db
          .select()
          .from(providerBillingInvoices)
          .where(eq(providerBillingInvoices.subscriptionId, subscription.id))
          .orderBy(desc(providerBillingInvoices.issuedAt))
          .limit(12)
      : [];
    const [plan] = subscription
      ? await this.db
          .select()
          .from(providerSubscriptionPlans)
          .where(eq(providerSubscriptionPlans.id, subscription.planId))
          .limit(1)
      : [];
    const notices = subscription
      ? await this.db
          .select()
          .from(providerSubscriptionNotices)
          .where(eq(providerSubscriptionNotices.subscriptionId, subscription.id))
          .orderBy(desc(providerSubscriptionNotices.createdAt))
          .limit(8)
      : [];
    return {
      role: member.role,
      canManage: canManageProviderBilling(member.role),
      subscription,
      plan: plan ?? null,
      invoices,
      notices,
    };
  }

  async beginSubscriptionCheckout(userId: string, planPriceId: string, providerId: string) {
    await this.assertBillingManager(userId, providerId);
    const [price] = await this.db
      .select()
      .from(providerSubscriptionPlanPrices)
      .where(eq(providerSubscriptionPlanPrices.id, planPriceId))
      .limit(1);
    if (!price?.active) throw new PickiError("NOT_FOUND", "Không có giá gói này");
    const [plan] = await this.db
      .select()
      .from(providerSubscriptionPlans)
      .where(eq(providerSubscriptionPlans.id, price.planId))
      .limit(1);
    if (!plan?.active) throw new PickiError("NOT_FOUND", "Gói không còn mở");
    const now = new Date();
    let [subscription] = await this.db
      .select()
      .from(providerSubscriptions)
      .where(and(eq(providerSubscriptions.providerId, providerId), sql`${providerSubscriptions.status} <> 'CANCELLED'`))
      .limit(1);
    if (!subscription) {
      const inserted = await this.db
        .insert(providerSubscriptions)
        .values({
          providerId,
          planId: plan.id,
          planPriceId: price.id,
          startsAt: now,
          expiresAt: now,
          status: "SUSPENDED",
          gracePeriodDays: plan.gracePeriodDays,
        })
        .returning();
      subscription = inserted[0];
    }
    if (!subscription) throw new PickiError("INTERNAL_ERROR", "Không tạo được gói");
    const due = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const [invoice] = await this.db
      .insert(providerBillingInvoices)
      .values({
        providerId,
        subscriptionId: subscription.id,
        amountVnd: price.priceVnd,
        status: "OPEN",
        dueAt: due,
        billingSnapshot: {
          durationMonths: price.durationMonths,
          planCode: plan.code,
          planId: plan.id,
          planPriceId: price.id,
        },
      })
      .returning();
    if (!invoice) throw new PickiError("INTERNAL_ERROR", "Không tạo được hóa đơn");
    const payosOrderCode = await this.allocatePayosCode("PROVIDER_BILLING");
    const [billing] = await this.db
      .insert(billingPayments)
      .values({
        invoiceId: invoice.id,
        amountVnd: price.priceVnd,
        status: "PENDING",
        providerKind: this.adapter.providerKey,
        payosOrderCode,
      })
      .returning();
    if (!billing) throw new PickiError("INTERNAL_ERROR", "Không tạo được thanh toán");
    let extras: IntentExtras = {};
    if (this.adapter.providerKey === "PAYOS") {
      const intent = await this.adapter.createIntent({
        pickiPaymentId: billing.id as PickiId,
        amountVnd: price.priceVnd as Vnd,
        metadata: {
          payosOrderCode,
          description: `Goi ${plan.code}`,
          returnPath: "/provider/subscription",
        },
      });
      extras = { checkoutUrl: intent.checkoutUrl, qrCode: intent.qrCode };
      await this.db
        .update(billingPayments)
        .set({ providerRef: intent.adapterReference, updatedAt: now })
        .where(eq(billingPayments.id, billing.id));
    }
    await this.db.insert(billingPaymentEvents).values({
      billingPaymentId: billing.id,
      eventType: "INTENT_CREATED",
      payload: { ...extras, payosOrderCode },
    });
    await this.db.insert(auditLogs).values({
      actorUserId: userId,
      action: "SUBSCRIPTION_CHECKOUT",
      entityType: "provider_billing_invoice",
      entityId: invoice.id,
      metadata: { providerId, planPriceId, amountVnd: price.priceVnd },
    });
    return {
      invoiceId: invoice.id,
      paymentId: billing.id,
      amountVnd: price.priceVnd,
      ...extras,
      ...(this.adapter.providerKey === "DEV_STUB" && this.config.nodeEnv !== "production"
        ? { devConfirmPath: `/v1/payments/billing/${billing.id}/dev-confirm` }
        : {}),
    };
  }

  async devConfirmBilling(userId: string, paymentId: string) {
    if (this.config.nodeEnv === "production" || this.adapter.providerKey !== "DEV_STUB") {
      throw new PickiError("FORBIDDEN", "Dev confirm only for DEV_STUB");
    }
    const [payment] = await this.db.select().from(billingPayments).where(eq(billingPayments.id, paymentId)).limit(1);
    if (!payment) throw new PickiError("NOT_FOUND", "Billing payment not found");
    const [invoice] = await this.db
      .select()
      .from(providerBillingInvoices)
      .where(eq(providerBillingInvoices.id, payment.invoiceId))
      .limit(1);
    if (!invoice) throw new PickiError("NOT_FOUND", "Invoice not found");
    await this.assertBillingManager(userId, invoice.providerId);
    return this.markBillingSucceeded(payment, "dev-stub", `dev-billing-${paymentId}`, { stub: true });
  }

  private async billingMember(userId: string, providerId: string) {
    const [member] = await this.db
      .select({ role: providerMembers.role })
      .from(providerMembers)
      .where(and(eq(providerMembers.userId, userId), eq(providerMembers.providerId, providerId)))
      .limit(1);
    if (!member) throw new PickiError("FORBIDDEN", "Không thuộc nhà cung cấp này");
    return member;
  }

  private async assertBillingManager(userId: string, providerId: string) {
    const member = await this.billingMember(userId, providerId);
    if (!canManageProviderBilling(member.role)) {
      throw new PickiError("FORBIDDEN", "Chỉ chủ quán hoặc quản lý được gia hạn gói");
    }
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
