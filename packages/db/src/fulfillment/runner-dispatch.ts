import { and, eq, inArray } from "drizzle-orm";
import {
  runnerOrderOffers,
  runnerPresence,
  runners,
  type PickiDb,
} from "../schema/index.js";

export const RUNNER_OFFER_BATCH_SIZE = 5;

const PRESENCE_RANK: Record<string, number> = {
  AVAILABLE: 0,
  PICKING_UP: 1,
  DELIVERING: 1,
  OFFLINE: 2,
};

type OrderTx = Parameters<Parameters<PickiDb["transaction"]>[0]>[0];

/** Runners never offered this order (skip/resend excludes prior batches). */
export async function selectRunnerOfferCandidates(
  db: PickiDb,
  zoneId: string,
  orderId: string,
  batchSize = RUNNER_OFFER_BATCH_SIZE,
): Promise<string[]> {
  const prior = await db
    .select({ runnerUserId: runnerOrderOffers.runnerUserId })
    .from(runnerOrderOffers)
    .where(eq(runnerOrderOffers.orderId, orderId));

  const excluded = new Set(prior.map((r) => r.runnerUserId));

  const rows = await db
    .select({
      userId: runners.userId,
      presence: runnerPresence.status,
    })
    .from(runners)
    .leftJoin(runnerPresence, eq(runnerPresence.runnerId, runners.id))
    .where(and(eq(runners.zoneId, zoneId), eq(runners.status, "ACTIVE")));

  const eligible = rows
    .filter((r) => !excluded.has(r.userId))
    .sort(
      (a, b) =>
        (PRESENCE_RANK[a.presence ?? "OFFLINE"] ?? 2) -
        (PRESENCE_RANK[b.presence ?? "OFFLINE"] ?? 2),
    );

  return eligible.slice(0, batchSize).map((r) => r.userId);
}

export async function supersedePendingOffers(tx: OrderTx, orderId: string) {
  await tx
    .update(runnerOrderOffers)
    .set({ status: "SUPERSEDED", updatedAt: new Date() })
    .where(
      and(eq(runnerOrderOffers.orderId, orderId), eq(runnerOrderOffers.status, "PENDING")),
    );
}

export async function createRunnerOffers(
  tx: OrderTx,
  orderId: string,
  wave: number,
  runnerUserIds: string[],
) {
  if (runnerUserIds.length === 0) return;
  await tx.insert(runnerOrderOffers).values(
    runnerUserIds.map((runnerUserId) => ({
      orderId,
      runnerUserId,
      wave,
      status: "PENDING",
      updatedAt: new Date(),
    })),
  );
}

export async function expireSiblingOffers(tx: OrderTx, orderId: string, wave: number) {
  await tx
    .update(runnerOrderOffers)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(
      and(
        eq(runnerOrderOffers.orderId, orderId),
        eq(runnerOrderOffers.wave, wave),
        eq(runnerOrderOffers.status, "PENDING"),
      ),
    );
}

export async function markOfferAccepted(
  tx: OrderTx,
  orderId: string,
  wave: number,
  runnerUserId: string,
) {
  await expireSiblingOffers(tx, orderId, wave);
  await tx
    .update(runnerOrderOffers)
    .set({ status: "ACCEPTED", updatedAt: new Date() })
    .where(
      and(
        eq(runnerOrderOffers.orderId, orderId),
        eq(runnerOrderOffers.wave, wave),
        eq(runnerOrderOffers.runnerUserId, runnerUserId),
      ),
    );
}

export async function hasPendingOffer(
  db: PickiDb,
  orderId: string,
  runnerUserId: string,
  wave: number,
): Promise<boolean> {
  const row = await db
    .select({ id: runnerOrderOffers.id })
    .from(runnerOrderOffers)
    .where(
      and(
        eq(runnerOrderOffers.orderId, orderId),
        eq(runnerOrderOffers.runnerUserId, runnerUserId),
        eq(runnerOrderOffers.wave, wave),
        eq(runnerOrderOffers.status, "PENDING"),
      ),
    )
    .limit(1);
  return row.length > 0;
}

export async function listPendingOfferOrderIds(db: PickiDb, runnerUserId: string) {
  const rows = await db
    .select({ orderId: runnerOrderOffers.orderId })
    .from(runnerOrderOffers)
    .where(
      and(
        eq(runnerOrderOffers.runnerUserId, runnerUserId),
        eq(runnerOrderOffers.status, "PENDING"),
      ),
    );
  return rows.map((r) => r.orderId);
}

export async function skipRunnerOffer(db: PickiDb, orderId: string, runnerUserId: string) {
  const updated = await db
    .update(runnerOrderOffers)
    .set({ status: "SKIPPED", updatedAt: new Date() })
    .where(
      and(
        eq(runnerOrderOffers.orderId, orderId),
        eq(runnerOrderOffers.runnerUserId, runnerUserId),
        eq(runnerOrderOffers.status, "PENDING"),
      ),
    )
    .returning({ id: runnerOrderOffers.id });
  return updated.length > 0;
}

export async function supersededRunnerUserIds(db: PickiDb, orderId: string, wave: number) {
  const rows = await db
    .select({ runnerUserId: runnerOrderOffers.runnerUserId })
    .from(runnerOrderOffers)
    .where(
      and(
        eq(runnerOrderOffers.orderId, orderId),
        eq(runnerOrderOffers.wave, wave),
        inArray(runnerOrderOffers.status, ["PENDING", "SUPERSEDED"]),
      ),
    );
  return rows.map((r) => r.runnerUserId);
}
