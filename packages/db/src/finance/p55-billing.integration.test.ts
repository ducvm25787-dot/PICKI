import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import {
  billingPayments,
  financialLedgerEntries,
  providerBillingInvoices,
  providerCommercialStandings,
  providerSubscriptionNotices,
  providerSubscriptionPlanPrices,
  providerSubscriptionPlans,
  providerSubscriptions,
} from "../schema/finance.js";
import { providers } from "../schema/providers.js";
import { recordSubscriptionPayment } from "./billing.js";
import { runSubscriptionLifecycle } from "./lifecycle.js";
import { payosOrderCodeFor, payosSourceFromOrderCode } from "./payos-code.js";
import { addMonths } from "./subscription.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("P5.5 billing flow", () => {
  const { db, sql } = createPickiDb(databaseUrl);

  afterAll(async () => {
    await sql.end();
  });

  it("pays, renews, and leaves BLOCKED standing in place", async () => {
    await expect(
      db.transaction(async (tx) => {
        const now = new Date("2026-10-04T12:00:00.000Z");
        const [provider] = await tx
          .insert(providers)
          .values({ slug: `p55-${Date.now()}`, brandName: "P55", providerType: "FOOD", status: "ACTIVE" })
          .returning();
        const [plan] = await tx
          .insert(providerSubscriptionPlans)
          .values({ code: `p55-${Date.now()}`, name: "P55", gracePeriodDays: 7 })
          .returning();
        const [price] = await tx
          .insert(providerSubscriptionPlanPrices)
          .values({ planId: plan!.id, durationMonths: 1, priceVnd: 100_000 })
          .returning();
        const [subscription] = await tx
          .insert(providerSubscriptions)
          .values({
            providerId: provider!.id,
            planId: plan!.id,
            planPriceId: price!.id,
            startsAt: now,
            expiresAt: addMonths(now, 1),
            status: "ACTIVE",
            gracePeriodDays: 7,
          })
          .returning();
        let sequence = Date.now() % 1_000_000;
        const code = payosOrderCodeFor("PROVIDER_BILLING", sequence);
        expect(payosSourceFromOrderCode(code)).toBe("PROVIDER_BILLING");

        async function pay(expiresAt: Date, paidAt: Date) {
          const [invoice] = await tx
            .insert(providerBillingInvoices)
            .values({
              providerId: provider!.id,
              subscriptionId: subscription!.id,
              amountVnd: 100_000,
              status: "OPEN",
              dueAt: paidAt,
              billingSnapshot: { durationMonths: 1, planId: plan!.id, planPriceId: price!.id },
            })
            .returning();
          const [payment] = await tx
            .insert(billingPayments)
            .values({
              invoiceId: invoice!.id,
              amountVnd: 100_000,
              status: "PENDING",
              providerKind: "DEV_STUB",
              payosOrderCode: payosOrderCodeFor("PROVIDER_BILLING", ++sequence),
            })
            .returning();
          await tx.update(providerSubscriptions).set({ expiresAt, status: "ACTIVE" }).where(eq(providerSubscriptions.id, subscription!.id));
          return recordSubscriptionPayment(tx, {
            paymentId: payment!.id,
            invoiceId: invoice!.id,
            amountVnd: 100_000,
            providerRef: "test",
            idempotencyKey: payment!.id,
            payload: { test: true },
            now: paidAt,
          });
        }

        const before = await pay(addMonths(now, 1), now);
        expect(before.expiresAt).toBe(addMonths(addMonths(now, 1), 1).toISOString());
        const [paidInvoice] = await tx
          .select()
          .from(providerBillingInvoices)
          .where(eq(providerBillingInvoices.subscriptionId, subscription!.id));
        expect(paidInvoice?.status).toBe("PAID");
        const [active] = await tx.select().from(providerSubscriptions).where(eq(providerSubscriptions.id, subscription!.id));
        expect(active?.status).toBe("ACTIVE");
        const ledger = await tx
          .select()
          .from(financialLedgerEntries)
          .where(eq(financialLedgerEntries.providerId, provider!.id));
        expect(ledger.map((row) => row.entryType).sort()).toEqual(["PAYMENT_RECEIVED", "SUBSCRIPTION_REVENUE"]);

        const expiredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const after = await pay(expiredAt, now);
        expect(after.expiresAt).toBe(addMonths(now, 1).toISOString());

        await tx.update(providerSubscriptions).set({ status: "GRACE", expiresAt: expiredAt }).where(eq(providerSubscriptions.id, subscription!.id));
        const duringGrace = await pay(expiredAt, now);
        expect(duringGrace.expiresAt).toBe(addMonths(now, 1).toISOString());
        const [stillActive] = await tx.select().from(providerSubscriptions).where(eq(providerSubscriptions.id, subscription!.id));
        expect(stillActive?.status).toBe("ACTIVE");

        await tx.insert(providerCommercialStandings).values({
          providerId: provider!.id,
          standing: "BLOCKED",
          reason: "fraud",
        });
        await pay(addMonths(now, 1), now);
        const [standing] = await tx
          .select()
          .from(providerCommercialStandings)
          .where(eq(providerCommercialStandings.providerId, provider!.id));
        expect(standing?.standing).toBe("BLOCKED");

        const suspendAt = new Date(expiredAt.getTime() + 20 * 24 * 60 * 60 * 1000);
        await tx
          .update(providerSubscriptions)
          .set({ status: "ACTIVE", expiresAt: expiredAt })
          .where(eq(providerSubscriptions.id, subscription!.id));
        const first = await runSubscriptionLifecycle(tx, suspendAt);
        const second = await runSubscriptionLifecycle(tx, suspendAt);
        expect(first.advanced).toBeGreaterThan(0);
        expect(second.notices).toBe(0);
        const [suspended] = await tx.select().from(providerSubscriptions).where(eq(providerSubscriptions.id, subscription!.id));
        expect(suspended?.status).toBe("SUSPENDED");
        const notices = await tx
          .select()
          .from(providerSubscriptionNotices)
          .where(eq(providerSubscriptionNotices.subscriptionId, subscription!.id));
        expect(new Set(notices.map((row) => row.kind)).size).toBe(notices.length);
        throw new Error("ROLLBACK");
      }),
    ).rejects.toThrow("ROLLBACK");
  });
});
