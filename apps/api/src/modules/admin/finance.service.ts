import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import {
  aggregateCampaignFinance,
  auditLogs,
  commercialPolicies,
  financialLedgerEntries,
  grantOnboardingTrial,
  ONBOARDING_TRIAL_SCOPE_KEY,
  orderCampaignAttributions,
  orderStatusHistory,
  orders,
  policyResolutionLabel,
  providerCampaigns,
  providerCommercialStandings,
  providerLocations,
  providerSubscriptionPlanPrices,
  providerSubscriptionPlans,
  providerSubscriptions,
  providerZoneMemberships,
  providers,
  readOnboardingTrial,
  recognizeTransactionFee,
  resolveCommercialPolicy,
  settlements,
  zones,
  type CommercialPolicy,
  type PickiDb,
} from "@picki/db";
import { canReadFinance, canWriteFinance, PickiError, type AdminAccess } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";

type FinanceScope = { scope: "GLOBAL" } | { scope: "CITY"; id: string } | { scope: "ZONE"; id: string };

@Injectable()
export class FinanceService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async zoneBySlug(slug: string) {
    const [zone] = await this.db.select().from(zones).where(eq(zones.slug, slug)).limit(1);
    if (!zone) throw new PickiError("NOT_FOUND", "Không thấy khu vực");
    return zone;
  }

  async overview(access: AdminAccess, scope: FinanceScope) {
    this.assertRead(access, scope);
    const where = this.scopeWhere(scope);
    const totals = await this.db
      .select({
        entryType: financialLedgerEntries.entryType,
        fromParty: financialLedgerEntries.fromParty,
        toParty: financialLedgerEntries.toParty,
        sourceType: financialLedgerEntries.sourceType,
        total: sql<number>`coalesce(sum(${financialLedgerEntries.amountVnd}), 0)::int`,
      })
      .from(financialLedgerEntries)
      .where(where)
      .groupBy(
        financialLedgerEntries.entryType,
        financialLedgerEntries.fromParty,
        financialLedgerEntries.toParty,
        financialLedgerEntries.sourceType,
      );
    const amount = (type: string, pred?: (row: (typeof totals)[number]) => boolean) =>
      totals
        .filter((row) => row.entryType === type && (pred ? pred(row) : true))
        .reduce((sum, row) => sum + Number(row.total), 0);
    const orderCount = await this.db
      .select({ count: sql<number>`count(distinct ${financialLedgerEntries.orderId})::int` })
      .from(financialLedgerEntries)
      .where(and(where, eq(financialLedgerEntries.entryType, "MERCHANDISE_GMV")));
    const inflow = amount("PLATFORM_FEE") + amount("SUBSCRIPTION_REVENUE");
    const outflow = amount("PICKEE_FUNDED_DISCOUNT") + amount("PICKEE_DELIVERY_SUBSIDY") + amount("REFUND");
    const providerNet =
      amount("MERCHANDISE_GMV") -
      amount("PROVIDER_FUNDED_DISCOUNT") -
      amount("PLATFORM_FEE") -
      amount("PROVIDER_DELIVERY_SUBSIDY");
    const paidToProvider = amount("PAYMENT_SENT", (row) => row.toParty === "PROVIDER");
    const paidToRunnerByProvider = amount("PAYMENT_SENT", (row) => row.toParty === "RUNNER" && row.fromParty === "PROVIDER");
    const paidToRunnerByPickee = amount("PAYMENT_SENT", (row) => row.toParty === "RUNNER" && row.fromParty === "PICKEE");
    const feeCollected = amount(
      "PAYMENT_RECEIVED",
      (row) => row.fromParty === "PROVIDER" && row.sourceType === "SETTLEMENT",
    );
    const fulfilled = await this.fulfilledCount(scope);
    return {
      orders: Number(orderCount[0]?.count ?? 0),
      fulfilledOrders: fulfilled,
      gmv: amount("MERCHANDISE_GMV"),
      platformFee: amount("PLATFORM_FEE"),
      subscriptionRevenue: amount("SUBSCRIPTION_REVENUE"),
      platformRevenue: inflow,
      providerFundedDiscount: amount("PROVIDER_FUNDED_DISCOUNT"),
      pickeeFundedDiscount: amount("PICKEE_FUNDED_DISCOUNT"),
      providerDeliverySubsidy: amount("PROVIDER_DELIVERY_SUBSIDY"),
      pickeeDeliverySubsidy: amount("PICKEE_DELIVERY_SUBSIDY"),
      runnerPayable: amount("RUNNER_PAYABLE"),
      refunds: amount("REFUND"),
      paymentReceived: amount("PAYMENT_RECEIVED"),
      paymentSent: amount("PAYMENT_SENT"),
      orderContribution: amount("PLATFORM_FEE") - amount("PICKEE_FUNDED_DISCOUNT") - amount("PICKEE_DELIVERY_SUBSIDY"),
      netContribution: inflow - outflow,
      runnerOutstanding: Math.max(0, amount("RUNNER_PAYABLE") - paidToRunnerByProvider - paidToRunnerByPickee),
      providerReceivableOutstanding: Math.max(0, providerNet - paidToProvider),
      providerOwesPickee: Math.max(0, amount("PLATFORM_FEE") - feeCollected),
      pickeeOwesProvider: Math.max(0, providerNet - paidToProvider),
      providerOwesRunner: Math.max(0, amount("RUNNER_PAYABLE") - amount("PICKEE_DELIVERY_SUBSIDY") - paidToRunnerByProvider),
      pickeeOwesRunner: Math.max(0, amount("PICKEE_DELIVERY_SUBSIDY") - paidToRunnerByPickee),
    };
  }

  async entries(
    access: AdminAccess,
    scope: FinanceScope,
    filter: {
      entryType?: string;
      providerId?: string;
      locationId?: string;
      orderId?: string;
      party?: string;
      from?: string;
      to?: string;
    } = {},
  ) {
    this.assertRead(access, scope);
    const conds = [this.scopeWhere(scope)];
    if (filter.entryType) conds.push(eq(financialLedgerEntries.entryType, filter.entryType));
    if (filter.providerId) conds.push(eq(financialLedgerEntries.providerId, filter.providerId));
    if (filter.locationId) conds.push(eq(financialLedgerEntries.providerLocationId, filter.locationId));
    if (filter.orderId) conds.push(eq(financialLedgerEntries.orderId, filter.orderId));
    if (filter.party) {
      conds.push(or(eq(financialLedgerEntries.fromParty, filter.party), eq(financialLedgerEntries.toParty, filter.party))!);
    }
    if (filter.from) conds.push(gte(financialLedgerEntries.postedAt, new Date(filter.from)));
    if (filter.to) conds.push(lte(financialLedgerEntries.postedAt, new Date(filter.to)));
    return this.db
      .select()
      .from(financialLedgerEntries)
      .where(and(...conds))
      .orderBy(desc(financialLedgerEntries.postedAt))
      .limit(100);
  }

  async policies(access: AdminAccess) {
    if (!access.superAdmin && !access.financeGlobal && !access.supportReadOnlyGlobal) {
      throw new PickiError("FORBIDDEN", "Chỉ xem hợp đồng ở phạm vi được cấp");
    }
    return this.db.select().from(commercialPolicies).orderBy(desc(commercialPolicies.createdAt));
  }

  async savePolicy(
    access: AdminAccess,
    actorUserId: string,
    input: {
      scopeType: string;
      scopeKey: string;
      revenueModel: string;
      subscriptionRequired: boolean;
      transactionFeeType: string;
      transactionFeeValue: number;
      transactionFeeBasis: string;
      policySource: string;
      note?: string;
      contractRef?: string;
    },
  ) {
    if (!canWriteFinance(access, { scope: "GLOBAL" })) {
      throw new PickiError("FORBIDDEN", "Chỉ SUPER_ADMIN hoặc FINANCE toàn cục sửa hợp đồng");
    }
    const now = new Date();
    const [open] = await this.db
      .select({ version: commercialPolicies.version })
      .from(commercialPolicies)
      .where(
        and(
          eq(commercialPolicies.scopeType, input.scopeType),
          eq(commercialPolicies.scopeKey, input.scopeKey),
          sql`${commercialPolicies.effectiveTo} is null`,
        ),
      )
      .limit(1);
    await this.db
      .update(commercialPolicies)
      .set({ effectiveTo: now })
      .where(
        and(
          eq(commercialPolicies.scopeType, input.scopeType),
          eq(commercialPolicies.scopeKey, input.scopeKey),
          sql`${commercialPolicies.effectiveTo} is null`,
        ),
      );
    const [row] = await this.db
      .insert(commercialPolicies)
      .values({
        scopeType: input.scopeType,
        scopeKey: input.scopeKey,
        revenueModel: input.revenueModel,
        subscriptionRequired: input.subscriptionRequired,
        transactionFeeType: input.transactionFeeType,
        transactionFeeValue: input.transactionFeeValue,
        transactionFeeBasis: input.transactionFeeBasis,
        policySource: input.policySource,
        note: input.note ?? null,
        contractRef: input.contractRef ?? null,
        version: (open?.version ?? 0) + 1,
      })
      .returning();
    await this.audit(actorUserId, "COMMERCIAL_POLICY_SAVED", "commercial_policy", row?.id ?? null, input);
    return row;
  }

  async plans(access: AdminAccess) {
    this.assertRead(access, { scope: "GLOBAL" });
    const plans = await this.db.select().from(providerSubscriptionPlans);
    const prices = await this.db.select().from(providerSubscriptionPlanPrices);
    const onboardingTrial = await readOnboardingTrial(this.db);
    return { plans, prices, onboardingTrial };
  }

  async savePlan(
    access: AdminAccess,
    actorUserId: string,
    input: {
      code: string;
      name: string;
      providerType?: string | null;
      gracePeriodDays?: number;
      maxLocations?: number | null;
      maxMembers?: number | null;
      featureFlags?: Record<string, boolean>;
      active?: boolean;
    },
  ) {
    if (!canWriteFinance(access, { scope: "GLOBAL" })) {
      throw new PickiError("FORBIDDEN", "Không được sửa gói");
    }
    const [existing] = await this.db
      .select()
      .from(providerSubscriptionPlans)
      .where(eq(providerSubscriptionPlans.code, input.code))
      .limit(1);
    const values = {
      name: input.name,
      providerType: input.providerType ?? null,
      gracePeriodDays: input.gracePeriodDays ?? existing?.gracePeriodDays ?? 7,
      maxLocations: input.maxLocations === undefined ? existing?.maxLocations ?? null : input.maxLocations,
      maxMembers: input.maxMembers === undefined ? existing?.maxMembers ?? null : input.maxMembers,
      featureFlags: input.featureFlags ?? existing?.featureFlags ?? {},
      active: input.active ?? existing?.active ?? true,
    };
    const [row] = existing
      ? await this.db.update(providerSubscriptionPlans).set(values).where(eq(providerSubscriptionPlans.id, existing.id)).returning()
      : await this.db.insert(providerSubscriptionPlans).values({ code: input.code, ...values }).returning();
    await this.audit(actorUserId, "SUBSCRIPTION_PLAN_SAVED", "provider_subscription_plan", row?.id ?? null, input);
    return row;
  }

  async savePlanPrice(
    access: AdminAccess,
    actorUserId: string,
    input: { planId: string; durationMonths: number; priceVnd: number; active?: boolean },
  ) {
    if (!canWriteFinance(access, { scope: "GLOBAL" })) {
      throw new PickiError("FORBIDDEN", "Không được sửa giá gói");
    }
    const [existing] = await this.db
      .select()
      .from(providerSubscriptionPlanPrices)
      .where(
        and(
          eq(providerSubscriptionPlanPrices.planId, input.planId),
          eq(providerSubscriptionPlanPrices.durationMonths, input.durationMonths),
          eq(providerSubscriptionPlanPrices.active, true),
        ),
      )
      .limit(1);
    const [row] = existing
      ? await this.db
          .update(providerSubscriptionPlanPrices)
          .set({ priceVnd: input.priceVnd, active: input.active ?? true })
          .where(eq(providerSubscriptionPlanPrices.id, existing.id))
          .returning()
      : await this.db.insert(providerSubscriptionPlanPrices).values({ ...input, active: input.active ?? true }).returning();
    await this.audit(actorUserId, "SUBSCRIPTION_PRICE_SAVED", "provider_subscription_plan_price", row?.id ?? null, input);
    return row;
  }

  async markSettlement(
    access: AdminAccess,
    actorUserId: string,
    input: {
      partyType: "PROVIDER" | "RUNNER";
      partyId: string;
      counterpartyId?: string;
      zoneId: string;
      amountVnd: number;
      direction: "PAYABLE" | "RECEIVABLE";
      obligation?: "PROVIDER_OWES_PICKEE" | "PICKEE_OWES_PROVIDER" | "PROVIDER_OWES_RUNNER" | "PICKEE_OWES_RUNNER";
      reference?: string;
      note?: string;
      paidAt?: string;
    },
  ) {
    const [zone] = await this.db.select({ cityId: zones.cityId }).from(zones).where(eq(zones.id, input.zoneId)).limit(1);
    if (!zone) throw new PickiError("NOT_FOUND", "Không có khu vực");
    this.assertWrite(access, { scope: "ZONE", id: input.zoneId });
    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const movement = this.settlementMovement(input);
    const [settlement] = await this.db
      .insert(settlements)
      .values({
        partyType: movement.partyType,
        partyId: input.partyId,
        zoneId: input.zoneId,
        cityId: zone.cityId,
        amountVnd: input.amountVnd,
        direction: movement.direction,
        status: movement.direction === "PAYABLE" ? "PAID" : "RECEIVED",
        reference: input.reference ?? null,
        note: input.note ?? null,
        paidAt,
        createdBy: actorUserId,
      })
      .returning();
    await this.db.insert(financialLedgerEntries).values({
      entryType: movement.entryType,
      providerId: movement.providerId,
      runnerUserId: movement.runnerUserId,
      zoneId: input.zoneId,
      cityId: zone.cityId,
      amountVnd: input.amountVnd,
      fromParty: movement.fromParty,
      toParty: movement.toParty,
      sourceType: "SETTLEMENT",
      sourceId: settlement?.id ?? null,
      occurredAt: paidAt,
      snapshot: { reference: input.reference ?? null, note: input.note ?? null, obligation: input.obligation ?? null },
    });
    await this.audit(actorUserId, "SETTLEMENT_MARKED", "settlement", settlement?.id ?? null, input, input.zoneId);
    return settlement;
  }

  async refund(access: AdminAccess, actorUserId: string, orderId: string, amountVnd: number, reason: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new PickiError("NOT_FOUND", "Không có đơn");
    this.assertWrite(access, { scope: "ZONE", id: order.zoneId });
    const [zone] = await this.db.select({ cityId: zones.cityId }).from(zones).where(eq(zones.id, order.zoneId)).limit(1);
    await this.db.insert(financialLedgerEntries).values({
      entryType: "REFUND",
      orderId: order.id,
      providerLocationId: order.providerLocationId,
      zoneId: order.zoneId,
      cityId: zone?.cityId ?? null,
      amountVnd,
      fromParty: "PROVIDER",
      toParty: "CUSTOMER",
      sourceType: "REFUND",
      sourceId: order.id,
      snapshot: { reason },
    });
    await this.audit(actorUserId, "ORDER_REFUND", "order", order.id, { amountVnd, reason }, order.zoneId);
    return {
      ok: true,
      financialRefund: "recorded" as const,
      externalRefund: "pending_manual" as const,
      message: "Đã ghi hoàn tiền trên sổ. Hoàn tiền ngân hàng/PayOS vẫn chờ xử lý thủ công.",
    };
  }

  async confirmFulfilledAfterCancel(access: AdminAccess, actorUserId: string, orderId: string, reason: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new PickiError("NOT_FOUND", "Không có đơn");
    this.assertWrite(access, { scope: "ZONE", id: order.zoneId });
    await this.db
      .update(orders)
      .set({ commercialFulfillmentStatus: "FULFILLED_AFTER_CANCEL", updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    const posted = await recognizeTransactionFee(this.db, order);
    await this.audit(actorUserId, "FULFILLED_AFTER_CANCEL", "order", order.id, { reason, feePosted: posted }, order.zoneId);
    return { ok: true, feePosted: posted === true };
  }

  async setStanding(
    access: AdminAccess,
    actorUserId: string,
    providerId: string,
    standing: string,
    reason: string,
  ) {
    const memberships = await this.db
      .select({ zoneId: providerZoneMemberships.zoneId })
      .from(providerZoneMemberships)
      .innerJoin(providerLocations, eq(providerLocations.id, providerZoneMemberships.providerLocationId))
      .where(eq(providerLocations.providerId, providerId));
    const allowed =
      canWriteFinance(access, { scope: "GLOBAL" }) ||
      memberships.some((row) => canWriteFinance(access, { scope: "ZONE", id: row.zoneId }));
    if (!allowed) {
      throw new PickiError("FORBIDDEN", "Chỉ SUPER_ADMIN hoặc FINANCE đúng phạm vi đổi tình trạng thương mại");
    }
    const [row] = await this.db
      .insert(providerCommercialStandings)
      .values({ providerId, standing, reason, actorUserId })
      .returning();
    await this.audit(actorUserId, "COMMERCIAL_STANDING", "provider", providerId, { standing, reason });
    return row;
  }

  async zoneBundle(access: AdminAccess, zoneSlug: string, filter: Parameters<FinanceService["entries"]>[2] = {}) {
    const zone = await this.zoneBySlug(zoneSlug);
    const scope = { scope: "ZONE" as const, id: zone.id };
    const [overview, entries, shopRows, settlementRows] = await Promise.all([
      this.overview(access, scope),
      this.entries(access, scope, filter),
      this.zoneProviders(zone.id),
      this.db.select().from(settlements).where(eq(settlements.zoneId, zone.id)).orderBy(desc(settlements.createdAt)).limit(30),
    ]);
    return {
      zone: { id: zone.id, slug: zone.slug, displayName: zone.displayName },
      canWriteSettlement: canWriteFinance(access, scope),
      canWriteStanding: canWriteFinance(access, { scope: "GLOBAL" }) || canWriteFinance(access, scope),
      overview,
      entries,
      providers: shopRows,
      settlements: settlementRows,
    };
  }

  async orderFinance(access: AdminAccess, orderId: string) {
    const [order] = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!order) throw new PickiError("NOT_FOUND", "Không có đơn");
    this.assertRead(access, { scope: "ZONE", id: order.zoneId });
    const ledger = await this.db
      .select()
      .from(financialLedgerEntries)
      .where(eq(financialLedgerEntries.orderId, orderId))
      .orderBy(desc(financialLedgerEntries.postedAt));
    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        zoneId: order.zoneId,
        commercialFulfillmentStatus: order.commercialFulfillmentStatus,
        financialSnapshot: order.financialSnapshot,
      },
      canWrite: canWriteFinance(access, { scope: "ZONE", id: order.zoneId }),
      entries: ledger,
    };
  }

  async campaignReport(access: AdminAccess) {
    this.assertRead(access, { scope: "GLOBAL" });
    const rows = await this.db
      .select({
        orderId: orderCampaignAttributions.orderId,
        campaignId: orderCampaignAttributions.campaignId,
        kind: orderCampaignAttributions.attributionKind,
        campaignName: providerCampaigns.name,
        snapshot: orders.financialSnapshot,
      })
      .from(orderCampaignAttributions)
      .innerJoin(providerCampaigns, eq(providerCampaigns.id, orderCampaignAttributions.campaignId))
      .innerJoin(orders, eq(orders.id, orderCampaignAttributions.orderId));
    const seen = new Set<string>();
    const report = aggregateCampaignFinance(
      rows.map((row) => {
        const snap = (row.snapshot ?? {}) as {
          merchandiseGmv?: number;
          providerFundedDiscount?: number;
          pickeeFundedDiscount?: number;
          providerDeliverySubsidy?: number;
          pickeeDeliverySubsidy?: number;
          transactionFeeAmount?: number;
        };
        const key = `${row.campaignId}:${row.orderId}`;
        const first = !seen.has(key);
        seen.add(key);
        return {
          orderId: row.orderId,
          campaignId: row.campaignId,
          kind: row.kind,
          gmv: first ? snap.merchandiseGmv ?? 0 : 0,
          providerFundedDiscount: first ? snap.providerFundedDiscount ?? 0 : 0,
          pickeeFundedDiscount: first ? snap.pickeeFundedDiscount ?? 0 : 0,
          providerDeliverySubsidy: first ? snap.providerDeliverySubsidy ?? 0 : 0,
          pickeeDeliverySubsidy: first ? snap.pickeeDeliverySubsidy ?? 0 : 0,
          transactionFee: first ? snap.transactionFeeAmount ?? 0 : 0,
          refund: 0,
        };
      }),
    );
    const names = new Map(rows.map((row) => [row.campaignId, row.campaignName]));
    return {
      dedupedGmv: report.pickeeWideGmv,
      campaigns: report.campaigns.map((row) => ({ ...row, name: names.get(row.campaignId) ?? row.campaignId })),
    };
  }

  async resolvePreview(access: AdminAccess, input: { providerId: string; locationId?: string; zoneId?: string }) {
    if (!access.superAdmin && !access.financeGlobal && !access.supportReadOnlyGlobal) {
      throw new PickiError("FORBIDDEN", "Chỉ xem hợp đồng ở phạm vi được cấp");
    }
    const [provider] = await this.db.select().from(providers).where(eq(providers.id, input.providerId)).limit(1);
    if (!provider) throw new PickiError("NOT_FOUND", "Không có nhà cung cấp");
    const zoneId = input.zoneId ?? null;
    const [zone] = zoneId ? await this.db.select().from(zones).where(eq(zones.id, zoneId)).limit(1) : [];
    const rows = await this.db.select().from(commercialPolicies).where(sql`${commercialPolicies.effectiveTo} is null`);
    const policies: CommercialPolicy[] = rows
      .filter((row) => row.scopeKey !== ONBOARDING_TRIAL_SCOPE_KEY)
      .map((row) => ({
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
        providerType: provider.providerType,
        providerId: provider.id,
        cityId: zone?.cityId ?? null,
        zoneId,
        locationId: input.locationId ?? null,
      },
      new Date(),
    );
    return { policy, label: policyResolutionLabel(policy) };
  }

  async onboardingTrial(access: AdminAccess) {
    this.assertRead(access, { scope: "GLOBAL" });
    return readOnboardingTrial(this.db);
  }

  async saveOnboardingTrial(
    access: AdminAccess,
    actorUserId: string,
    input: { months: number; planId?: string | null },
  ) {
    return this.savePolicy(access, actorUserId, {
      scopeType: "SYSTEM",
      scopeKey: ONBOARDING_TRIAL_SCOPE_KEY,
      revenueModel: "FREE",
      subscriptionRequired: false,
      transactionFeeType: "NONE",
      transactionFeeValue: input.months,
      transactionFeeBasis: "ORDER_FIXED",
      policySource: "MANUAL_OVERRIDE",
      note: "Cấu hình trial nhà cung cấp mới. Không tham gia tính phí đơn.",
      contractRef: input.planId ?? undefined,
    });
  }

  async grantTrial(access: AdminAccess, actorUserId: string, providerId: string) {
    if (!canWriteFinance(access, { scope: "GLOBAL" })) {
      throw new PickiError("FORBIDDEN", "Chỉ SUPER_ADMIN hoặc FINANCE toàn cục cấp trial");
    }
    const result = await grantOnboardingTrial(this.db, providerId);
    await this.audit(actorUserId, "ONBOARDING_TRIAL_GRANTED", "provider", providerId, result);
    return result;
  }

  private async zoneProviders(zoneId: string) {
    const rows = await this.db
      .select({
        providerId: providers.id,
        brandName: providers.brandName,
        providerType: providers.providerType,
        status: providers.status,
      })
      .from(providerZoneMemberships)
      .innerJoin(providerLocations, eq(providerLocations.id, providerZoneMemberships.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerZoneMemberships.zoneId, zoneId));
    const unique = [...new Map(rows.map((row) => [row.providerId, row])).values()];
    const ids = unique.map((row) => row.providerId);
    if (ids.length === 0) return [];
    const standings = await this.db
      .select()
      .from(providerCommercialStandings)
      .where(inArray(providerCommercialStandings.providerId, ids))
      .orderBy(desc(providerCommercialStandings.createdAt));
    const subs = await this.db
      .select()
      .from(providerSubscriptions)
      .where(inArray(providerSubscriptions.providerId, ids));
    return Promise.all(
      unique.map(async (row) => ({
        ...row,
        standing: standings.find((item) => item.providerId === row.providerId)?.standing ?? "NORMAL",
        subscriptionStatus: subs.find((item) => item.providerId === row.providerId)?.status ?? null,
        signals: await this.standingSignals(row.providerId),
      })),
    );
  }

  private async standingSignals(providerId: string) {
    const locations = await this.db
      .select({ id: providerLocations.id })
      .from(providerLocations)
      .where(eq(providerLocations.providerId, providerId));
    const ids = locations.map((row) => row.id);
    if (ids.length === 0) {
      return { acceptedThenCancelled: 0, lateCancel: 0, runnerAssignedThenCancelled: 0, customerConfirmedAfterCancel: 0, suspectedOffPlatform: 0 };
    }
    const history = await this.db
      .select({ fromStatus: orderStatusHistory.fromStatus, toStatus: orderStatusHistory.toStatus })
      .from(orderStatusHistory)
      .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
      .where(inArray(orders.providerLocationId, ids));
    const cancelled = new Set(["CUSTOMER_CANCELLED", "SYSTEM_CANCELLED", "PROVIDER_REJECTED"]);
    const accepted = history.filter((row) => row.fromStatus === "PROVIDER_ACCEPTED" && cancelled.has(row.toStatus)).length;
    const late = history.filter((row) => (row.fromStatus === "READY" || row.fromStatus === "PREPARING") && cancelled.has(row.toStatus)).length;
    const runner = history.filter((row) => row.fromStatus === "RUNNER_ASSIGNED" && cancelled.has(row.toStatus)).length;
    const [confirmed] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(inArray(orders.providerLocationId, ids), eq(orders.commercialFulfillmentStatus, "FULFILLED_AFTER_CANCEL")));
    return {
      acceptedThenCancelled: accepted,
      lateCancel: late,
      runnerAssignedThenCancelled: runner,
      customerConfirmedAfterCancel: Number(confirmed?.count ?? 0),
      suspectedOffPlatform: 0,
    };
  }

  private async fulfilledCount(scope: FinanceScope) {
    const conds = [inArray(orders.commercialFulfillmentStatus, ["FULFILLED", "FULFILLED_AFTER_CANCEL"])];
    if (scope.scope === "ZONE") conds.push(eq(orders.zoneId, scope.id));
    if (scope.scope === "CITY") {
      const zoneRows = await this.db.select({ id: zones.id }).from(zones).where(eq(zones.cityId, scope.id));
      const ids = zoneRows.map((row) => row.id);
      if (ids.length === 0) return 0;
      conds.push(inArray(orders.zoneId, ids));
    }
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(and(...conds));
    return Number(row?.count ?? 0);
  }

  private settlementMovement(input: {
    partyType: "PROVIDER" | "RUNNER";
    partyId: string;
    counterpartyId?: string;
    direction: "PAYABLE" | "RECEIVABLE";
    obligation?: "PROVIDER_OWES_PICKEE" | "PICKEE_OWES_PROVIDER" | "PROVIDER_OWES_RUNNER" | "PICKEE_OWES_RUNNER";
  }) {
    const obligation = input.obligation;
    if (obligation === "PROVIDER_OWES_PICKEE") {
      return { partyType: "PROVIDER" as const, direction: "RECEIVABLE" as const, entryType: "PAYMENT_RECEIVED", fromParty: "PROVIDER", toParty: "PICKEE", providerId: input.partyId, runnerUserId: null };
    }
    if (obligation === "PICKEE_OWES_PROVIDER") {
      return { partyType: "PROVIDER" as const, direction: "PAYABLE" as const, entryType: "PAYMENT_SENT", fromParty: "PICKEE", toParty: "PROVIDER", providerId: input.partyId, runnerUserId: null };
    }
    if (obligation === "PROVIDER_OWES_RUNNER") {
      return { partyType: "RUNNER" as const, direction: "PAYABLE" as const, entryType: "PAYMENT_SENT", fromParty: "PROVIDER", toParty: "RUNNER", providerId: input.counterpartyId ?? null, runnerUserId: input.partyId };
    }
    if (obligation === "PICKEE_OWES_RUNNER") {
      return { partyType: "RUNNER" as const, direction: "PAYABLE" as const, entryType: "PAYMENT_SENT", fromParty: "PICKEE", toParty: "RUNNER", providerId: null, runnerUserId: input.partyId };
    }
    return {
      partyType: input.partyType,
      direction: input.direction,
      entryType: input.direction === "PAYABLE" ? "PAYMENT_SENT" : "PAYMENT_RECEIVED",
      fromParty: input.direction === "PAYABLE" ? "PICKEE" : input.partyType,
      toParty: input.direction === "PAYABLE" ? input.partyType : "PICKEE",
      providerId: input.partyType === "PROVIDER" ? input.partyId : input.counterpartyId ?? null,
      runnerUserId: input.partyType === "RUNNER" ? input.partyId : null,
    };
  }

  private scopeWhere(scope: FinanceScope) {
    if (scope.scope === "ZONE") return eq(financialLedgerEntries.zoneId, scope.id);
    if (scope.scope === "CITY") return eq(financialLedgerEntries.cityId, scope.id);
    return sql`true`;
  }

  private assertRead(access: AdminAccess, scope: FinanceScope) {
    if (!canReadFinance(access, scope)) throw new PickiError("FORBIDDEN", "Không xem được tài chính phạm vi này");
  }

  private assertWrite(access: AdminAccess, scope: FinanceScope) {
    if (!canWriteFinance(access, scope)) throw new PickiError("FORBIDDEN", "Không ghi được tài chính phạm vi này");
  }

  private async audit(
    actorUserId: string,
    action: string,
    entityType: string,
    entityId: string | null,
    metadata: unknown,
    zoneId?: string,
  ) {
    await this.db.insert(auditLogs).values({
      actorUserId,
      action,
      entityType,
      entityId,
      zoneId: zoneId ?? null,
      metadata: metadata as Record<string, unknown>,
    });
  }
}
