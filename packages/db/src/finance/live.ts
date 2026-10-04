import { and, desc, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import {
  commercialPolicies,
  financialLedgerEntries,
  providerCommercialStandings,
  providerSubscriptions,
} from "../schema/finance.js";
import { providerLocations, providers } from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import {
  buildOrderFinancialSnapshot,
  resolveCommercialPolicy,
  type CommercialPolicy,
  type OrderFinancialSnapshot,
} from "./commercial.js";
import { commerceEligibility, type CommercialStanding } from "./eligibility.js";
import { openingEconomicEntries, type LedgerDraft } from "./ledger.js";
import { advanceSubscriptionStatus, type SubscriptionStatus } from "./subscription.js";

type QueryDb = Pick<PickiDb, "select" | "insert">;

export async function buildLiveOrderSnapshot(
  db: QueryDb,
  input: {
    providerId: string;
    providerLocationId: string;
    zoneId: string;
    merchandiseGmv: number;
    customerDeliveryFee: number;
    providerDeliverySubsidy: number;
    pickeeDeliverySubsidy: number;
    runnerPayable: number;
    providerFundedDiscount: number;
    pickeeFundedDiscount: number;
    customerPays: number;
    at?: Date;
  },
): Promise<OrderFinancialSnapshot> {
  const at = input.at ?? new Date();
  const [provider] = await db
    .select({ providerType: providers.providerType })
    .from(providers)
    .where(eq(providers.id, input.providerId))
    .limit(1);
  const [zone] = await db
    .select({ cityId: zones.cityId })
    .from(zones)
    .where(eq(zones.id, input.zoneId))
    .limit(1);
  const rows = await db
    .select()
    .from(commercialPolicies)
    .where(and(lte(commercialPolicies.effectiveFrom, at), or(isNull(commercialPolicies.effectiveTo), sql`${commercialPolicies.effectiveTo} > ${at}`)));
  const policies: CommercialPolicy[] = rows.map((row) => ({
    id: row.id,
    version: row.version,
    scopeType: row.scopeType as CommercialPolicy["scopeType"],
    scopeKey: row.scopeKey,
    revenueModel: row.revenueModel as CommercialPolicy["revenueModel"],
    subscriptionRequired: row.subscriptionRequired,
    transactionFeeType: row.transactionFeeType as CommercialPolicy["transactionFeeType"],
    transactionFeeValue: row.transactionFeeValue,
    transactionFeeBasis: row.transactionFeeBasis as CommercialPolicy["transactionFeeBasis"],
    policySource: row.policySource as CommercialPolicy["policySource"],
    note: row.note,
    contractRef: row.contractRef,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  }));
  const policy = resolveCommercialPolicy(
    policies,
    {
      providerType: provider?.providerType ?? "",
      providerId: input.providerId,
      cityId: zone?.cityId ?? null,
      zoneId: input.zoneId,
      locationId: input.providerLocationId,
    },
    at,
  );
  return buildOrderFinancialSnapshot({ ...input, policy });
}

export async function commerceBlockReason(
  db: QueryDb,
  input: { providerId: string; locationId?: string | null; zoneId?: string | null; cityId?: string | null },
  at = new Date(),
): Promise<string | null> {
  const providerId = input.providerId;
  const [provider] = await db
    .select({ status: providers.status, providerType: providers.providerType })
    .from(providers)
    .where(eq(providers.id, providerId))
    .limit(1);
  if (!provider) return "Không tìm thấy quán";
  const [standing] = await db
    .select({ standing: providerCommercialStandings.standing })
    .from(providerCommercialStandings)
    .where(eq(providerCommercialStandings.providerId, providerId))
    .orderBy(desc(providerCommercialStandings.createdAt))
    .limit(1);
  const [subscription] = await db
    .select()
    .from(providerSubscriptions)
    .where(eq(providerSubscriptions.providerId, providerId))
    .orderBy(desc(providerSubscriptions.createdAt))
    .limit(1);
  const policyRows = await db.select().from(commercialPolicies);
  const resolved = resolveCommercialPolicy(
    policyRows.map((row) => ({
      id: row.id,
      version: row.version,
      scopeType: row.scopeType as CommercialPolicy["scopeType"],
      scopeKey: row.scopeKey,
      revenueModel: row.revenueModel as CommercialPolicy["revenueModel"],
      subscriptionRequired: row.subscriptionRequired,
      transactionFeeType: row.transactionFeeType as CommercialPolicy["transactionFeeType"],
      transactionFeeValue: row.transactionFeeValue,
      transactionFeeBasis: row.transactionFeeBasis as CommercialPolicy["transactionFeeBasis"],
      policySource: row.policySource as CommercialPolicy["policySource"],
      note: row.note,
      contractRef: row.contractRef,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    })),
    {
      providerType: provider.providerType,
      providerId,
      cityId: input.cityId ?? null,
      zoneId: input.zoneId ?? null,
      locationId: input.locationId ?? null,
    },
    at,
  );
  const required = resolved?.subscriptionRequired === true;
  let subscriptionStatus = subscription?.status ?? null;
  if (subscription && subscription.status !== "CANCELLED") {
    subscriptionStatus = advanceSubscriptionStatus({
      status: subscription.status as SubscriptionStatus,
      expiresAt: subscription.expiresAt,
      gracePeriodDays: subscription.gracePeriodDays,
      now: at,
    });
  }
  const gate = commerceEligibility({
    operationalStatus: provider.status,
    subscriptionStatus,
    subscriptionRequired: required,
    commercialStanding: (standing?.standing as CommercialStanding | undefined) ?? "NORMAL",
  });
  if (gate.canAcceptNewCommerce) return null;
  if (gate.reasons.includes("commercial")) return "Quán đang bị hạn chế thương mại";
  if (gate.reasons.includes("subscription")) return "Gói dịch vụ chưa hiệu lực. Quán vẫn đăng nhập và gia hạn được.";
  return "Quán đang tạm ngưng nhận đơn mới";
}

export async function insertOpeningLedger(
  db: Pick<PickiDb, "insert">,
  orderId: string,
  snapshot: OrderFinancialSnapshot,
  parties: { providerId: string; locationId: string; zoneId: string; cityId: string | null },
) {
  const drafts = openingEconomicEntries(orderId, snapshot, parties);
  if (drafts.length === 0) return;
  await db.insert(financialLedgerEntries).values(drafts.map(toRow));
}

export async function insertLedgerDrafts(db: Pick<PickiDb, "insert">, drafts: LedgerDraft[]) {
  if (drafts.length === 0) return;
  await db.insert(financialLedgerEntries).values(drafts.map(toRow));
}

export async function recognizeTransactionFee(
  db: QueryDb,
  order: {
    id: string;
    providerLocationId: string;
    zoneId: string;
    runnerUserId: string | null;
    financialSnapshot: unknown;
  },
) {
  const snapshot = order.financialSnapshot as OrderFinancialSnapshot | null;
  if (!snapshot || snapshot.transactionFeeAmount <= 0) return false;
  const existing = await db
    .select({ id: financialLedgerEntries.id })
    .from(financialLedgerEntries)
    .where(
      and(eq(financialLedgerEntries.orderId, order.id), eq(financialLedgerEntries.entryType, "PLATFORM_FEE")),
    )
    .limit(1);
  if (existing[0]) return false;
  const [zone] = await db.select({ cityId: zones.cityId }).from(zones).where(eq(zones.id, order.zoneId)).limit(1);
  const [location] = await db
    .select({ providerId: providerLocations.providerId })
    .from(providerLocations)
    .where(eq(providerLocations.id, order.providerLocationId))
    .limit(1);
  await db.insert(financialLedgerEntries).values({
    entryType: "PLATFORM_FEE",
    orderId: order.id,
    providerId: location?.providerId ?? null,
    providerLocationId: order.providerLocationId,
    zoneId: order.zoneId,
    cityId: zone?.cityId ?? null,
    runnerUserId: order.runnerUserId,
    amountVnd: snapshot.transactionFeeAmount,
    fromParty: "PROVIDER",
    toParty: "PICKEE",
    sourceType: "ORDER",
    sourceId: order.id,
    snapshot: {
      commercialPolicyId: snapshot.commercialPolicyId,
      commercialPolicyVersion: snapshot.commercialPolicyVersion,
      transactionFeeType: snapshot.transactionFeeType,
      transactionFeeValue: snapshot.transactionFeeValue,
      transactionFeeBasis: snapshot.transactionFeeBasis,
    },
  });
  return true;
}

function toRow(draft: LedgerDraft) {
  return {
    entryType: draft.entryType,
    orderId: draft.orderId ?? null,
    providerId: draft.providerId ?? null,
    providerLocationId: draft.providerLocationId ?? null,
    zoneId: draft.zoneId ?? null,
    cityId: draft.cityId ?? null,
    campaignId: draft.campaignId ?? null,
    runnerUserId: draft.runnerUserId ?? null,
    paymentId: draft.paymentId ?? null,
    billingPaymentId: draft.billingPaymentId ?? null,
    amountVnd: draft.amountVnd,
    fromParty: draft.fromParty,
    toParty: draft.toParty,
    sourceType: draft.sourceType,
    sourceId: draft.sourceId ?? null,
    reversalOfId: draft.reversalOfId ?? null,
    snapshot: draft.snapshot ?? {},
  };
}
