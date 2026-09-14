import { eq } from "drizzle-orm";
import { orders, users, type PickiDb } from "@picki/db";

export async function loadRunnerSummary(db: PickiDb, runnerUserId: string | null) {
  if (!runnerUserId) return null;
  const row = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, runnerUserId))
    .limit(1);
  if (!row[0]) return { userId: runnerUserId, displayName: "Runner" };
  return {
    userId: row[0].id,
    displayName: row[0].displayName ?? "Runner",
  };
}

export function orderHandoffFields(order: typeof orders.$inferSelect) {
  return {
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    providerHandoffAt: order.providerHandoffAt?.toISOString() ?? null,
    runnerSoughtAt: order.runnerSoughtAt?.toISOString() ?? null,
    runnerUserId: order.runnerUserId,
  };
}
