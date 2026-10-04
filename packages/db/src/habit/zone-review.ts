import { and, eq, inArray } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { providerDailyUpdates, providerDailyUpdateZoneTargets } from "../schema/habit.js";

/** Approve or reject only the named Zones. Other Zone targets of the same post stay as they are. */
export async function applyLocalPostZoneReview(
  db: PickiDb,
  input: {
    updateId: string;
    zoneIds: readonly string[];
    approve: boolean;
    approvedSurface: string | null;
    reviewedBy: string | null;
  },
): Promise<void> {
  if (input.zoneIds.length === 0) return;
  await db
    .update(providerDailyUpdateZoneTargets)
    .set({
      reviewStatus: input.approve ? "APPROVED" : "REJECTED",
      approvedSurface: input.approve ? input.approvedSurface : null,
      reviewedBy: input.reviewedBy,
      reviewedAt: new Date(),
    })
    .where(
      and(
        eq(providerDailyUpdateZoneTargets.updateId, input.updateId),
        inArray(providerDailyUpdateZoneTargets.zoneId, [...input.zoneIds]),
        eq(providerDailyUpdateZoneTargets.reviewStatus, "PENDING_REVIEW"),
      ),
    );
  const targets = await db
    .select({ status: providerDailyUpdateZoneTargets.reviewStatus })
    .from(providerDailyUpdateZoneTargets)
    .where(eq(providerDailyUpdateZoneTargets.updateId, input.updateId));
  const anyApproved = targets.some((target) => target.status === "APPROVED");
  const allRejected = targets.length > 0 && targets.every((target) => target.status === "REJECTED");
  await db
    .update(providerDailyUpdates)
    .set({
      status: anyApproved ? "ACTIVE" : allRejected ? "REJECTED" : "PENDING_REVIEW",
      ...(input.approve && input.approvedSurface ? { approvedSurface: input.approvedSurface } : {}),
      updatedAt: new Date(),
    })
    .where(eq(providerDailyUpdates.id, input.updateId));
}
