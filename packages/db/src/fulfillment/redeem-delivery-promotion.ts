import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import type { StockTx } from "../commerce/stock.js";
import {
  deliveryPromotionRedemptions,
  deliveryPromotions,
} from "../schema/delivery-promotions.js";
import {
  applyDeliveryPromotion,
  canConsumePromotion,
  parseEligibleModes,
  type DeliveryPromotionRule,
  type DeliverySponsorType,
  type DeliverySubsidyMode,
} from "./delivery-promotion.js";
import { snapshotPickeeRunner, type DeliveryFundingSnapshot } from "./delivery-snapshot.js";

type Db = PickiDb | StockTx;

export type FoodDeliveryFunding = {
  snapshot: DeliveryFundingSnapshot;
  promotionId: string | null;
};

type FundingInput = {
  zoneId: string;
  providerId: string;
  customerUserId: string;
  subtotalVnd: number;
  baseVnd: number;
  now?: Date;
};

function ruleFromRow(row: typeof deliveryPromotions.$inferSelect): DeliveryPromotionRule {
  return {
    id: row.id,
    sponsorType: row.sponsorType as DeliverySponsorType,
    subsidyMode: row.subsidyMode as DeliverySubsidyMode,
    maxSubsidyPerOrderVnd: row.maxSubsidyPerOrderVnd,
    providerShareVnd: row.providerShareVnd,
    pickeeShareVnd: row.pickeeShareVnd,
    minimumOrderVnd: row.minimumOrderVnd,
    eligibleModes: parseEligibleModes(row.eligibleModes),
  };
}

async function loadCandidates(db: Db, input: FundingInput, now: Date) {
  const rows = await db
    .select()
    .from(deliveryPromotions)
    .where(
      and(
        eq(deliveryPromotions.active, true),
        eq(deliveryPromotions.zoneId, input.zoneId),
        lte(deliveryPromotions.startsAt, now),
        gt(deliveryPromotions.endsAt, now),
        lte(deliveryPromotions.minimumOrderVnd, input.subtotalVnd),
        or(
          isNull(deliveryPromotions.providerId),
          eq(deliveryPromotions.providerId, input.providerId),
        ),
      ),
    );

  return rows
    .map((row) => ({
      row,
      rule: ruleFromRow(row),
      snapshot: applyDeliveryPromotion({
        baseVnd: input.baseVnd,
        subtotalVnd: input.subtotalVnd,
        fulfillmentMode: "PICKEE_RUNNER",
        promotion: ruleFromRow(row),
      }),
    }))
    .filter((item) => item.snapshot.customerDeliveryFee < input.baseVnd || item.snapshot.pickeeDeliverySubsidy + item.snapshot.providerDeliverySubsidy > 0)
    .sort((a, b) => a.snapshot.customerDeliveryFee - b.snapshot.customerDeliveryFee);
}

async function countWhere(db: Db, where: ReturnType<typeof and> | ReturnType<typeof eq>) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(deliveryPromotionRedemptions)
    .where(where);
  return row?.n ?? 0;
}

async function usageOf(db: Db, promotionId: string, customerUserId: string, now: Date) {
  const promoUser = and(
    eq(deliveryPromotionRedemptions.promotionId, promotionId),
    eq(deliveryPromotionRedemptions.customerUserId, customerUserId),
  );
  const totalUsed = await countWhere(db, eq(deliveryPromotionRedemptions.promotionId, promotionId));
  const userUsed = await countWhere(db, promoUser);
  const userUsedToday = await countWhere(
    db,
    and(
      promoUser,
      sql`(${deliveryPromotionRedemptions.createdAt} at time zone 'Asia/Ho_Chi_Minh')::date = (${now.toISOString()}::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date`,
    ),
  );
  return { totalUsed, userUsed, userUsedToday };
}

function allows(
  row: typeof deliveryPromotions.$inferSelect,
  usage: { totalUsed: number; userUsed: number; userUsedToday: number },
  pickeeSubsidyVnd: number,
) {
  return canConsumePromotion({
    usageLimitTotal: row.usageLimitTotal,
    usageLimitPerUser: row.usageLimitPerUser,
    usageLimitPerUserPerDay: row.usageLimitPerUserPerDay,
    totalUsed: usage.totalUsed,
    userUsed: usage.userUsed,
    userUsedToday: usage.userUsedToday,
    budgetVnd: row.budgetVnd,
    budgetSpentVnd: row.budgetSpentVnd,
    pickeeSubsidyVnd,
  });
}

/** Quote only. Does not consume budget or usage. */
export async function previewFoodDeliveryFunding(
  db: Db,
  input: FundingInput,
): Promise<FoodDeliveryFunding> {
  const now = input.now ?? new Date();
  const candidates = await loadCandidates(db, input, now);
  for (const candidate of candidates) {
    const usage = await usageOf(db, candidate.row.id, input.customerUserId, now);
    if (allows(candidate.row, usage, candidate.snapshot.pickeeDeliverySubsidy)) {
      return { snapshot: candidate.snapshot, promotionId: candidate.row.id };
    }
  }
  return { snapshot: snapshotPickeeRunner(input.baseVnd), promotionId: null };
}

/**
 * Lock a campaign and recheck limits. Caller inserts the order, then
 * `commitDeliveryRedemption`, in the same transaction so the lock holds.
 */
export async function reserveFoodDeliveryFunding(
  tx: StockTx,
  input: FundingInput,
): Promise<FoodDeliveryFunding> {
  const now = input.now ?? new Date();
  const candidates = await loadCandidates(tx, input, now);
  for (const candidate of candidates) {
    await tx.execute(
      sql`select id from delivery_promotions where id = ${candidate.row.id} for update`,
    );
    const [fresh] = await tx
      .select()
      .from(deliveryPromotions)
      .where(eq(deliveryPromotions.id, candidate.row.id))
      .limit(1);
    if (!fresh || !fresh.active || fresh.startsAt > now || fresh.endsAt <= now) continue;
    const snapshot = applyDeliveryPromotion({
      baseVnd: input.baseVnd,
      subtotalVnd: input.subtotalVnd,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: ruleFromRow(fresh),
    });
    const usage = await usageOf(tx, fresh.id, input.customerUserId, now);
    if (!allows(fresh, usage, snapshot.pickeeDeliverySubsidy)) continue;
    return { snapshot, promotionId: fresh.id };
  }
  return { snapshot: snapshotPickeeRunner(input.baseVnd), promotionId: null };
}

export async function commitDeliveryRedemption(
  tx: StockTx,
  input: {
    orderId: string;
    customerUserId: string;
    promotionId: string;
    providerSubsidyVnd: number;
    pickeeSubsidyVnd: number;
  },
) {
  await tx.insert(deliveryPromotionRedemptions).values({
    promotionId: input.promotionId,
    orderId: input.orderId,
    customerUserId: input.customerUserId,
    providerSubsidyVnd: input.providerSubsidyVnd,
    pickeeSubsidyVnd: input.pickeeSubsidyVnd,
  });
  if (input.pickeeSubsidyVnd > 0) {
    await tx.execute(sql`
      update delivery_promotions
      set budget_spent_vnd = budget_spent_vnd + ${input.pickeeSubsidyVnd},
          updated_at = now()
      where id = ${input.promotionId}
    `);
  }
}

/** Drop Pickee's recorded subsidy when the order leaves a funded runner job. Usage stays. */
export async function releasePickeeDeliverySubsidy(
  db: PickiDb,
  order: { id: string; deliveryPromotionId: string | null },
) {
  if (!order.deliveryPromotionId) return;
  await db.transaction(async (tx) => {
    const [redemption] = await tx
      .select()
      .from(deliveryPromotionRedemptions)
      .where(eq(deliveryPromotionRedemptions.orderId, order.id))
      .limit(1);
    if (!redemption || redemption.pickeeSubsidyVnd <= 0) return;

    await tx.execute(
      sql`select id from delivery_promotions where id = ${redemption.promotionId} for update`,
    );
    await tx.execute(sql`
      update delivery_promotions
      set budget_spent_vnd = greatest(budget_spent_vnd - ${redemption.pickeeSubsidyVnd}, 0),
          updated_at = now()
      where id = ${redemption.promotionId}
    `);
    await tx
      .update(deliveryPromotionRedemptions)
      .set({ pickeeSubsidyVnd: 0 })
      .where(eq(deliveryPromotionRedemptions.id, redemption.id));
  });
}
