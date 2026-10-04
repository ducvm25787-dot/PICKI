import { and, eq, isNull, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import {
  commercialPolicies,
  providerSubscriptionPlanPrices,
  providerSubscriptionPlans,
  providerSubscriptions,
} from "../schema/finance.js";
import { addMonths } from "./subscription.js";

/** Reserved SYSTEM key. Fee resolution only matches SYSTEM when scope_key is empty. */
export const ONBOARDING_TRIAL_SCOPE_KEY = "onboarding_trial";

type TrialDb = Pick<PickiDb, "select" | "insert">;

export function onboardingTrialFromPolicies(
  policies: readonly { scopeType: string; scopeKey: string; transactionFeeValue: number; effectiveTo: Date | null; contractRef: string | null }[],
): { months: number; planId: string | null } {
  const row = policies.find(
    (policy) =>
      policy.scopeType === "SYSTEM" &&
      policy.scopeKey === ONBOARDING_TRIAL_SCOPE_KEY &&
      policy.effectiveTo == null,
  );
  return {
    months: Math.max(0, row?.transactionFeeValue ?? 0),
    planId: row?.contractRef ?? null,
  };
}

export async function readOnboardingTrial(db: TrialDb): Promise<{ months: number; planId: string | null }> {
  const rows = await db
    .select({
      scopeType: commercialPolicies.scopeType,
      scopeKey: commercialPolicies.scopeKey,
      transactionFeeValue: commercialPolicies.transactionFeeValue,
      effectiveTo: commercialPolicies.effectiveTo,
      contractRef: commercialPolicies.contractRef,
    })
    .from(commercialPolicies)
    .where(
      and(
        eq(commercialPolicies.scopeType, "SYSTEM"),
        eq(commercialPolicies.scopeKey, ONBOARDING_TRIAL_SCOPE_KEY),
        isNull(commercialPolicies.effectiveTo),
      ),
    )
    .limit(1);
  return onboardingTrialFromPolicies(rows);
}

/** Explicit grant. Does nothing when trial months are 0 or an open subscription already exists. */
export async function grantOnboardingTrial(
  db: TrialDb,
  providerId: string,
  now = new Date(),
): Promise<{ granted: boolean; reason: string; expiresAt?: string }> {
  const config = await readOnboardingTrial(db);
  if (config.months <= 0) return { granted: false, reason: "trial_off" };
  if (!config.planId) return { granted: false, reason: "no_plan" };
  const [open] = await db
    .select({ id: providerSubscriptions.id })
    .from(providerSubscriptions)
    .where(and(eq(providerSubscriptions.providerId, providerId), sql`${providerSubscriptions.status} <> 'CANCELLED'`))
    .limit(1);
  if (open) return { granted: false, reason: "already_subscribed" };
  const [plan] = await db
    .select()
    .from(providerSubscriptionPlans)
    .where(eq(providerSubscriptionPlans.id, config.planId))
    .limit(1);
  if (!plan?.active) return { granted: false, reason: "plan_inactive" };
  const [price] = await db
    .select()
    .from(providerSubscriptionPlanPrices)
    .where(
      and(
        eq(providerSubscriptionPlanPrices.planId, plan.id),
        eq(providerSubscriptionPlanPrices.active, true),
      ),
    )
    .limit(1);
  if (!price) return { granted: false, reason: "no_price" };
  const expiresAt = addMonths(now, config.months);
  await db.insert(providerSubscriptions).values({
    providerId,
    planId: plan.id,
    planPriceId: price.id,
    startsAt: now,
    expiresAt,
    status: "TRIAL",
    gracePeriodDays: plan.gracePeriodDays,
  });
  return { granted: true, reason: "granted", expiresAt: expiresAt.toISOString() };
}
