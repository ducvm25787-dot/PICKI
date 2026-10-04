import { and, eq, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { providerSubscriptionNotices, providerSubscriptions } from "../schema/finance.js";
import { advanceSubscriptionStatus, dueSubscriptionNotices, type SubscriptionStatus } from "./subscription.js";

type LifecycleDb = Pick<PickiDb, "select" | "insert" | "update">;

export async function runSubscriptionLifecycle(db: LifecycleDb, now = new Date()) {
  const rows = await db
    .select()
    .from(providerSubscriptions)
    .where(sql`${providerSubscriptions.status} <> 'CANCELLED'`);
  let advanced = 0;
  let notices = 0;
  for (const row of rows) {
    const next = advanceSubscriptionStatus({
      status: row.status as SubscriptionStatus,
      expiresAt: row.expiresAt,
      gracePeriodDays: row.gracePeriodDays,
      now,
    });
    if (next !== row.status) {
      await db
        .update(providerSubscriptions)
        .set({ status: next, updatedAt: now })
        .where(eq(providerSubscriptions.id, row.id));
      advanced += 1;
    }
    const sent = await db
      .select({ kind: providerSubscriptionNotices.kind })
      .from(providerSubscriptionNotices)
      .where(
        and(
          eq(providerSubscriptionNotices.subscriptionId, row.id),
          eq(providerSubscriptionNotices.periodEnd, row.expiresAt),
        ),
      );
    const due = dueSubscriptionNotices({
      expiresAt: row.expiresAt,
      gracePeriodDays: row.gracePeriodDays,
      now,
      alreadySent: sent.map((item) => item.kind),
    });
    for (const kind of due) {
      const inserted = await db
        .insert(providerSubscriptionNotices)
        .values({ subscriptionId: row.id, kind, periodEnd: row.expiresAt })
        .onConflictDoNothing()
        .returning({ id: providerSubscriptionNotices.id });
      notices += inserted.length;
    }
  }
  return { advanced, notices };
}
