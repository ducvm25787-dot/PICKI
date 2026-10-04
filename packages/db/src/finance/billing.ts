import { eq } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import {
  billingPaymentEvents,
  billingPayments,
  financialLedgerEntries,
  providerBillingInvoices,
  providerSubscriptions,
} from "../schema/finance.js";
import { extendSubscriptionExpiry } from "./subscription.js";

type BillingDb = Pick<PickiDb, "select" | "insert" | "update">;

export async function recordSubscriptionPayment(
  db: BillingDb,
  input: {
    paymentId: string;
    invoiceId: string;
    amountVnd: number;
    providerRef: string;
    idempotencyKey: string;
    payload: unknown;
    now?: Date;
  },
): Promise<{ expiresAt: string }> {
  const now = input.now ?? new Date();
  await db
    .update(billingPayments)
    .set({ status: "SUCCEEDED", providerRef: input.providerRef, updatedAt: now })
    .where(eq(billingPayments.id, input.paymentId));
  await db.insert(billingPaymentEvents).values({
    billingPaymentId: input.paymentId,
    eventType: "SUCCEEDED",
    payload: input.payload as Record<string, unknown>,
    idempotencyKey: input.idempotencyKey,
  });
  const [invoice] = await db
    .update(providerBillingInvoices)
    .set({ status: "PAID", paidAt: now })
    .where(eq(providerBillingInvoices.id, input.invoiceId))
    .returning();
  if (!invoice) throw new Error("Invoice not found");
  const [subscription] = await db
    .select()
    .from(providerSubscriptions)
    .where(eq(providerSubscriptions.id, invoice.subscriptionId))
    .limit(1);
  if (!subscription) throw new Error("Subscription not found");
  const months = Number((invoice.billingSnapshot as { durationMonths?: number }).durationMonths ?? 1);
  const expiresAt = extendSubscriptionExpiry({ now, expiresAt: subscription.expiresAt, durationMonths: months });
  await db
    .update(providerSubscriptions)
    .set({
      status: "ACTIVE",
      expiresAt,
      startsAt: subscription.startsAt,
      planId: (invoice.billingSnapshot as { planId?: string }).planId ?? subscription.planId,
      planPriceId: (invoice.billingSnapshot as { planPriceId?: string }).planPriceId ?? subscription.planPriceId,
      lastInvoiceId: invoice.id,
      nextBillingAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(providerSubscriptions.id, subscription.id));
  await db.insert(financialLedgerEntries).values([
    {
      entryType: "PAYMENT_RECEIVED",
      providerId: invoice.providerId,
      billingPaymentId: input.paymentId,
      amountVnd: input.amountVnd,
      fromParty: "PROVIDER",
      toParty: "PICKEE",
      sourceType: "PROVIDER_SUBSCRIPTION",
      sourceId: invoice.id,
    },
    {
      entryType: "SUBSCRIPTION_REVENUE",
      providerId: invoice.providerId,
      billingPaymentId: input.paymentId,
      amountVnd: input.amountVnd,
      fromParty: "PROVIDER",
      toParty: "PICKEE",
      sourceType: "PROVIDER_SUBSCRIPTION",
      sourceId: invoice.id,
    },
  ]);
  return { expiresAt: expiresAt.toISOString() };
}
