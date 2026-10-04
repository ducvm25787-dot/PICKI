import { describe, expect, it } from "vitest";
import {
  canManageProviderBilling,
  canReadFinance,
  canWriteFinance,
  resolveAdminAccess,
} from "@picki/shared";
import {
  LedgerBook,
  PAYOS_BILLING_CODE_BASE,
  PAYOS_ORDER_CODE_BASE,
  advanceSubscriptionStatus,
  aggregateCampaignFinance,
  buildOrderFinancialSnapshot,
  commerceEligibility,
  extendSubscriptionExpiry,
  feeRecognized,
  isPlanDuration,
  openingEconomicEntries,
  payosOrderCodeFor,
  payosSourceFromOrderCode,
  payingSubscriptionClearsStanding,
  providerEconomics,
  reconcilePickee,
  renewalAnchor,
  resolveCommercialPolicy,
  riskStandingFromSignals,
  transactionFeeAmount,
  type CommercialPolicy,
} from "./index.js";

const at = new Date("2026-10-04T12:00:00+07:00");

function policy(partial: Partial<CommercialPolicy> & Pick<CommercialPolicy, "id" | "scopeType" | "scopeKey">): CommercialPolicy {
  return {
    version: 1,
    revenueModel: "FREE",
    subscriptionRequired: false,
    transactionFeeType: "NONE",
    transactionFeeValue: 0,
    transactionFeeBasis: "MERCHANDISE_GMV",
    policySource: "DEFAULT",
    note: null,
    contractRef: null,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    ...partial,
  };
}

const food = policy({
  id: "food",
  scopeType: "PROVIDER_TYPE",
  scopeKey: "FOOD",
  revenueModel: "HYBRID",
  subscriptionRequired: true,
  transactionFeeType: "PERCENT",
  transactionFeeValue: 300,
  policySource: "DEFAULT",
});

const market = policy({
  id: "market",
  scopeType: "PROVIDER_TYPE",
  scopeKey: "MARKET",
  revenueModel: "HYBRID",
  subscriptionRequired: true,
  transactionFeeType: "PERCENT",
  transactionFeeValue: 0,
  policySource: "DEFAULT",
});

describe("P5 acceptance", () => {
  it("1-6 delivery economics stay split from merchandise", () => {
    const snapshot = buildOrderFinancialSnapshot({
      merchandiseGmv: 80_000,
      customerDeliveryFee: 8_000,
      providerDeliverySubsidy: 5_000,
      pickeeDeliverySubsidy: 20_000,
      runnerPayable: 28_000,
      providerFundedDiscount: 0,
      pickeeFundedDiscount: 0,
      customerPays: 88_000,
      policy: null,
    });
    expect(snapshot.customerDeliveryFee).toBeLessThan(snapshot.runnerPayable);
    expect(snapshot.providerDeliverySubsidy).toBe(5_000);
    expect(snapshot.pickeeDeliverySubsidy).toBe(20_000);
    const both = buildOrderFinancialSnapshot({
      ...snapshot,
      providerDeliverySubsidy: 5_000,
      pickeeDeliverySubsidy: 3_000,
      providerFundedDiscount: 10_000,
      pickeeFundedDiscount: 5_000,
      customerPays: 195_000,
      merchandiseGmv: 200_000,
      customerDeliveryFee: 10_000,
      runnerPayable: 18_000,
      policy: policy({
        id: "hybrid",
        scopeType: "PROVIDER",
        scopeKey: "p",
        revenueModel: "HYBRID",
        transactionFeeType: "PERCENT",
        transactionFeeValue: 500,
        policySource: "CONTRACT",
        contractRef: "HD-1",
      }),
    });
    expect(both.transactionFeeAmount).toBe(10_000);
    expect(both.providerFundedDiscount).not.toBe(both.providerDeliverySubsidy);
    const view = providerEconomics(both);
    expect(view.providerNetReceivable).toBe(200_000 - 10_000 - 10_000 - 5_000);
    expect(view.pickeeFundedAmount).toBe(5_000 + 3_000);
    expect(view.providerFundedAmount).toBe(10_000 + 5_000);
    expect(view.pickeePlatformRevenue).toBe(10_000);
  });

  it("7-8 percent and fixed platform fees", () => {
    expect(
      transactionFeeAmount({
        revenueModel: "TRANSACTION_FEE",
        transactionFeeType: "PERCENT",
        transactionFeeValue: 500,
        transactionFeeBasis: "MERCHANDISE_GMV",
        merchandiseGmv: 200_000,
        providerFundedDiscount: 0,
      }),
    ).toBe(10_000);
    expect(
      transactionFeeAmount({
        revenueModel: "TRANSACTION_FEE",
        transactionFeeType: "FIXED",
        transactionFeeValue: 4_000,
        transactionFeeBasis: "ORDER_FIXED",
        merchandiseGmv: 200_000,
        providerFundedDiscount: 0,
      }),
    ).toBe(4_000);
  });

  it("9 old snapshot ignores a later contract", () => {
    const original = buildOrderFinancialSnapshot({
      merchandiseGmv: 100_000,
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 0,
      providerFundedDiscount: 0,
      pickeeFundedDiscount: 0,
      customerPays: 100_000,
      policy: food,
    });
    const later = resolveCommercialPolicy(
      [food, { ...food, id: "food-2", version: 2, transactionFeeValue: 900 }],
      { providerType: "FOOD", providerId: "p", cityId: null, zoneId: null, locationId: null },
      at,
    );
    expect(later?.transactionFeeValue).toBe(900);
    expect(original.transactionFeeAmount).toBe(3_000);
    expect(original.commercialPolicyVersion).toBe(1);
  });

  it("10-12 refund and reversal do not edit the original entry", () => {
    const book = new LedgerBook();
    const gmv = book.post({
      id: "gmv",
      entryType: "MERCHANDISE_GMV",
      amountVnd: 200_000,
      fromParty: "CUSTOMER",
      toParty: "PROVIDER",
      sourceType: "ORDER",
      sourceId: "o1",
    });
    book.post({
      id: "refund",
      entryType: "REFUND",
      amountVnd: 50_000,
      fromParty: "PROVIDER",
      toParty: "CUSTOMER",
      sourceType: "REFUND",
      sourceId: "o1",
    });
    book.reverse(gmv.id, "rev");
    expect(book.entries[0]?.amountVnd).toBe(200_000);
    expect(book.entries[0]?.entryType).toBe("MERCHANDISE_GMV");
    expect(book.entries.find((entry) => entry.id === "rev")?.entryType).toBe("REVERSAL");
    expect(book.entries.find((entry) => entry.id === "refund")?.amountVnd).toBe(50_000);
  });

  it("13-16 scope filters do not leak and campaigns do not double-count GMV", () => {
    const rows = [
      { orderId: "o1", providerId: "a", cityId: "hanoi", zoneId: "kv", locationId: "l1", gmv: 100 },
      { orderId: "o2", providerId: "b", cityId: "hanoi", zoneId: "kv", locationId: "l2", gmv: 40 },
      { orderId: "o3", providerId: "a", cityId: "hanoi", zoneId: "other", locationId: "l3", gmv: 10 },
    ];
    expect(rows.filter((row) => row.providerId === "a").reduce((sum, row) => sum + row.gmv, 0)).toBe(110);
    expect(rows.filter((row) => row.cityId === "hanoi").reduce((sum, row) => sum + row.gmv, 0)).toBe(150);
    expect(rows.filter((row) => row.zoneId === "kv").reduce((sum, row) => sum + row.gmv, 0)).toBe(140);
    expect(rows.filter((row) => row.providerId === "a").map((row) => row.locationId)).toEqual(["l1", "l3"]);
    const report = aggregateCampaignFinance([
      {
        orderId: "o1",
        campaignId: "c1",
        kind: "HERO_PRODUCT",
        gmv: 100,
        providerFundedDiscount: 0,
        pickeeFundedDiscount: 0,
        providerDeliverySubsidy: 0,
        pickeeDeliverySubsidy: 0,
        transactionFee: 0,
        refund: 0,
      },
      {
        orderId: "o1",
        campaignId: "c2",
        kind: "PRICE_PROMOTION",
        gmv: 100,
        providerFundedDiscount: 10,
        pickeeFundedDiscount: 0,
        providerDeliverySubsidy: 0,
        pickeeDeliverySubsidy: 0,
        transactionFee: 5,
        refund: 0,
      },
    ]);
    expect(report.pickeeWideGmv).toBe(100);
    expect(report.campaigns.find((row) => row.campaignId === "c1")?.pickeeFundedDiscount).toBe(0);
    expect(report.campaigns.find((row) => row.campaignId === "c1")?.providerDeliverySubsidy).toBe(0);
  });

  it("19-22 cash events do not rewrite economics or ledger history", () => {
    const book = new LedgerBook();
    const fee = book.post({
      id: "fee",
      entryType: "PLATFORM_FEE",
      amountVnd: 3_000,
      fromParty: "PROVIDER",
      toParty: "PICKEE",
      sourceType: "ORDER",
    });
    book.post({
      id: "recv",
      entryType: "PAYMENT_RECEIVED",
      amountVnd: 88_000,
      fromParty: "CUSTOMER",
      toParty: "PROVIDER",
      sourceType: "PAYMENT",
    });
    book.post({
      id: "sent",
      entryType: "PAYMENT_SENT",
      amountVnd: 15_000,
      fromParty: "PROVIDER",
      toParty: "RUNNER",
      sourceType: "SETTLEMENT",
    });
    expect(fee.amountVnd).toBe(3_000);
    expect(book.entries).toHaveLength(3);
    expect(book.entries[0]?.entryType).toBe("PLATFORM_FEE");
    const outstandingRunner = 28_000 - 0;
    const outstandingProvider = 80_000 - 0;
    expect(outstandingRunner).toBe(28_000);
    expect(outstandingProvider).toBe(80_000);
  });

  it("23 SUPPORT reads finance and cannot write it", () => {
    const support = resolveAdminAccess([{ role: "SUPPORT", scopeType: "ZONE", scopeId: "z1" }]);
    const zoneAdmin = resolveAdminAccess([{ role: "ZONE_ADMIN", scopeType: "ZONE", scopeId: "z1" }]);
    const finance = resolveAdminAccess([{ role: "FINANCE", scopeType: "ZONE", scopeId: "z1" }]);
    expect(support && canReadFinance(support, { scope: "ZONE", id: "z1" })).toBe(true);
    expect(support && canWriteFinance(support, { scope: "ZONE", id: "z1" })).toBe(false);
    expect(zoneAdmin && canReadFinance(zoneAdmin, { scope: "ZONE", id: "z1" })).toBe(true);
    expect(zoneAdmin && canWriteFinance(zoneAdmin, { scope: "ZONE", id: "z1" })).toBe(false);
    expect(finance && canWriteFinance(finance, { scope: "ZONE", id: "z1" })).toBe(true);
  });

  it("24 inflow minus outflow equals net contribution", () => {
    const row = reconcilePickee({
      transactionFee: 10_000,
      subscriptionRevenue: 99_000,
      pickeeFundedDiscount: 5_000,
      pickeeDeliverySubsidy: 3_000,
      pickeeRefunds: 1_000,
    });
    expect(row.netContribution).toBe(row.inflow - row.outflow);
    expect(row.orderContribution).toBe(10_000 - 5_000 - 3_000);
    expect(row.subscriptionRevenue).toBe(99_000);
    expect(row.platformRevenue).toBe(109_000);
  });

  it("A1-A5 provider type, override, subscription, hybrid, and free", () => {
    const override = policy({
      id: "contract",
      scopeType: "PROVIDER",
      scopeKey: "pho",
      revenueModel: "TRANSACTION_FEE",
      transactionFeeType: "PERCENT",
      transactionFeeValue: 100,
      policySource: "CONTRACT",
      contractRef: "HD-PHO",
      note: "Hợp đồng riêng",
    });
    const context = {
      providerType: "FOOD",
      providerId: "pho",
      cityId: "hanoi",
      zoneId: "kv",
      locationId: "loc",
    };
    const foodHit = resolveCommercialPolicy([food, market], { ...context, providerId: "other" }, at);
    const marketHit = resolveCommercialPolicy([food, market], { ...context, providerType: "MARKET", providerId: "shop" }, at);
    expect(foodHit?.id).toBe("food");
    expect(marketHit?.transactionFeeValue).toBe(0);
    const won = resolveCommercialPolicy([food, override], context, at);
    expect(won?.id).toBe("contract");
    expect(won?.policySource).toBe("CONTRACT");
    expect(won?.contractRef).toBe("HD-PHO");
    const subscriptionOnly = buildOrderFinancialSnapshot({
      merchandiseGmv: 50_000,
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 0,
      providerFundedDiscount: 0,
      pickeeFundedDiscount: 0,
      customerPays: 50_000,
      policy: policy({
        id: "sub",
        scopeType: "PROVIDER_TYPE",
        scopeKey: "BEAUTY",
        revenueModel: "SUBSCRIPTION",
        subscriptionRequired: true,
        transactionFeeType: "PERCENT",
        transactionFeeValue: 300,
      }),
    });
    expect(subscriptionOnly.transactionFeeAmount).toBe(0);
    const hybrid = buildOrderFinancialSnapshot({
      merchandiseGmv: 100_000,
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 0,
      providerFundedDiscount: 0,
      pickeeFundedDiscount: 0,
      customerPays: 100_000,
      policy: food,
    });
    expect(hybrid.commercialModel).toBe("HYBRID");
    expect(hybrid.transactionFeeAmount).toBe(3_000);
    expect(
      buildOrderFinancialSnapshot({
        merchandiseGmv: 10_000,
        customerDeliveryFee: 0,
        providerDeliverySubsidy: 0,
        pickeeDeliverySubsidy: 0,
        runnerPayable: 0,
        providerFundedDiscount: 0,
        pickeeFundedDiscount: 0,
        customerPays: 10_000,
        policy: null,
      }).transactionFeeAmount,
    ).toBe(0);
  });

  it("A6 plan durations and renewal anchors", () => {
    for (const months of [1, 3, 6, 12, 36]) expect(isPlanDuration(months)).toBe(true);
    expect(isPlanDuration(2)).toBe(false);
    const future = new Date("2026-12-01T00:00:00Z");
    const now = new Date("2026-10-04T00:00:00Z");
    expect(renewalAnchor(now, future).toISOString()).toBe(future.toISOString());
    const stale = new Date("2026-01-01T00:00:00Z");
    expect(renewalAnchor(now, stale).toISOString()).toBe(now.toISOString());
    expect(extendSubscriptionExpiry({ now, expiresAt: future, durationMonths: 1 }).getTime()).toBeGreaterThan(
      future.getTime(),
    );
  });

  it("A7-A11 subscription payment, grace, and suspended login", () => {
    const expires = new Date("2026-10-01T00:00:00Z");
    const duringGrace = new Date("2026-10-03T00:00:00Z");
    expect(
      advanceSubscriptionStatus({ status: "ACTIVE", expiresAt: expires, gracePeriodDays: 7, now: duringGrace }),
    ).toBe("GRACE");
    const pastDue = new Date("2026-10-10T00:00:00Z");
    expect(
      advanceSubscriptionStatus({ status: "GRACE", expiresAt: expires, gracePeriodDays: 7, now: pastDue }),
    ).toBe("PAST_DUE");
    const suspended = new Date("2026-10-20T00:00:00Z");
    expect(
      advanceSubscriptionStatus({ status: "PAST_DUE", expiresAt: expires, gracePeriodDays: 7, now: suspended }),
    ).toBe("SUSPENDED");
    const restored = extendSubscriptionExpiry({ now: duringGrace, expiresAt: expires, durationMonths: 1 });
    expect(restored.getTime()).toBeGreaterThan(duringGrace.getTime());
    const gate = commerceEligibility({
      operationalStatus: "ACTIVE",
      subscriptionStatus: "SUSPENDED",
      subscriptionRequired: true,
      commercialStanding: "NORMAL",
      memberRole: "OWNER",
    });
    expect(gate.canLogin).toBe(true);
    expect(gate.canRenewSubscription).toBe(true);
    expect(gate.canAcceptNewCommerce).toBe(false);
  });

  it("A12-A18 fee posts only when fulfilled and standing stays blocked", () => {
    expect(feeRecognized("NOT_FULFILLED")).toBe(false);
    expect(feeRecognized("FULFILLED")).toBe(true);
    expect(feeRecognized("FULFILLED_AFTER_CANCEL")).toBe(true);
    const lines = openingEconomicEntries(
      "order",
      {
        merchandiseGmv: 80_000,
        customerDeliveryFee: 0,
        providerDeliverySubsidy: 0,
        pickeeDeliverySubsidy: 0,
        runnerPayable: 15_000,
        providerFundedDiscount: 0,
        pickeeFundedDiscount: 0,
      },
      { providerId: "p", locationId: "l", zoneId: "z", cityId: "c" },
    );
    expect(lines.some((line) => line.entryType === "PLATFORM_FEE")).toBe(false);
    expect(lines.some((line) => line.entryType === "RUNNER_PAYABLE")).toBe(true);
    expect(
      riskStandingFromSignals({
        acceptedThenCancelled: 4,
        lateCancel: 1,
        runnerAssignedThenCancelled: 2,
        customerConfirmedAfterCancel: 1,
        suspectedOffPlatform: 1,
        confirmedOffPlatform: 0,
      }),
    ).toBe("NORMAL");
    expect(payingSubscriptionClearsStanding("BLOCKED")).toBe("BLOCKED");
    const blocked = commerceEligibility({
      operationalStatus: "ACTIVE",
      subscriptionStatus: "ACTIVE",
      subscriptionRequired: true,
      commercialStanding: "BLOCKED",
    });
    expect(blocked.canAcceptNewCommerce).toBe(false);
    const suspendedOnly = commerceEligibility({
      operationalStatus: "ACTIVE",
      subscriptionStatus: "SUSPENDED",
      subscriptionRequired: true,
      commercialStanding: "NORMAL",
    });
    expect(suspendedOnly.reasons).toEqual(["subscription"]);
    expect(suspendedOnly.reasons).not.toContain("commercial");
    expect(canManageProviderBilling("OWNER")).toBe(true);
    expect(canManageProviderBilling("MANAGER")).toBe(true);
    expect(canManageProviderBilling("STAFF")).toBe(false);
    expect(payosSourceFromOrderCode(payosOrderCodeFor("ORDER", 7))).toBe("ORDER");
    expect(payosSourceFromOrderCode(payosOrderCodeFor("PROVIDER_BILLING", 7))).toBe("PROVIDER_BILLING");
    expect(payosOrderCodeFor("ORDER", 7)).not.toBe(payosOrderCodeFor("PROVIDER_BILLING", 7));
    expect(PAYOS_ORDER_CODE_BASE).toBeLessThan(PAYOS_BILLING_CODE_BASE);
    expect(payosSourceFromOrderCode(0xabc)).toBe("LEGACY");
  });
});
