import { describe, expect, it } from "vitest";
import { policyResolutionLabel, resolveCommercialPolicy, type CommercialPolicy } from "./commercial.js";
import { commerceEligibility, payingSubscriptionClearsStanding } from "./eligibility.js";
import { onboardingTrialFromPolicies, ONBOARDING_TRIAL_SCOPE_KEY } from "./onboarding.js";
import { providerFinanceFromRows } from "./provider-view.js";
import { advanceSubscriptionStatus } from "./subscription.js";

const now = new Date("2026-10-04T12:00:00.000Z");

function policy(partial: Partial<CommercialPolicy> & Pick<CommercialPolicy, "scopeType" | "scopeKey">): CommercialPolicy {
  return {
    id: partial.scopeKey || "system",
    version: 1,
    revenueModel: "TRANSACTION_FEE",
    subscriptionRequired: false,
    transactionFeeType: "PERCENT",
    transactionFeeValue: 300,
    transactionFeeBasis: "MERCHANDISE_GMV",
    policySource: "DEFAULT",
    note: null,
    contractRef: null,
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: null,
    ...partial,
  };
}

describe("P5.5 acceptance", () => {
  it("trial config does not become the fee policy, and provider override wins", () => {
    const trial = policy({
      scopeType: "SYSTEM",
      scopeKey: ONBOARDING_TRIAL_SCOPE_KEY,
      revenueModel: "FREE",
      transactionFeeType: "NONE",
      transactionFeeValue: 3,
      policySource: "MANUAL_OVERRIDE",
    });
    const food = policy({ scopeType: "PROVIDER_TYPE", scopeKey: "FOOD", transactionFeeValue: 300 });
    const market = policy({ scopeType: "PROVIDER_TYPE", scopeKey: "MARKET", transactionFeeValue: 100 });
    const contract = policy({
      scopeType: "PROVIDER",
      scopeKey: "shop-1",
      transactionFeeValue: 0,
      revenueModel: "SUBSCRIPTION",
      policySource: "CONTRACT",
      version: 2,
    });
    expect(onboardingTrialFromPolicies([trial]).months).toBe(3);
    const foodPolicy = resolveCommercialPolicy([trial, food, market], {
      providerType: "FOOD",
      providerId: "shop-1",
      cityId: null,
      zoneId: null,
      locationId: null,
    }, now);
    expect(foodPolicy?.transactionFeeValue).toBe(300);
    const overridden = resolveCommercialPolicy([trial, food, contract], {
      providerType: "FOOD",
      providerId: "shop-1",
      cityId: null,
      zoneId: null,
      locationId: null,
    }, now);
    expect(overridden?.scopeType).toBe("PROVIDER");
    expect(policyResolutionLabel(overridden)).toContain("hợp đồng nhà cung cấp");
    expect(policyResolutionLabel(overridden)).toContain("v2");
  });

  it("keeps subscription suspension apart from commercial block", () => {
    const sell = (subscriptionStatus: string | null, standing: "NORMAL" | "BLOCKED") =>
      commerceEligibility({
        operationalStatus: "ACTIVE",
        subscriptionStatus,
        subscriptionRequired: true,
        commercialStanding: standing,
      });
    expect(sell("ACTIVE", "NORMAL").canAcceptNewCommerce).toBe(true);
    expect(sell("GRACE", "NORMAL").canAcceptNewCommerce).toBe(true);
    expect(sell("SUSPENDED", "NORMAL").canAcceptNewCommerce).toBe(false);
    expect(sell("ACTIVE", "BLOCKED").canAcceptNewCommerce).toBe(false);
    expect(sell("SUSPENDED", "BLOCKED").canLogin).toBe(true);
    expect(sell("SUSPENDED", "BLOCKED").canRenewSubscription).toBe(true);
    expect(payingSubscriptionClearsStanding("BLOCKED")).toBe("BLOCKED");
    const restored = sell("ACTIVE", payingSubscriptionClearsStanding("BLOCKED"));
    expect(restored.canAcceptNewCommerce).toBe(false);
  });

  it("expires a trial onto the same clock and keeps unused paid time", () => {
    const expires = new Date("2026-10-01T00:00:00.000Z");
    expect(
      advanceSubscriptionStatus({ status: "TRIAL", expiresAt: new Date("2026-11-01T00:00:00.000Z"), gracePeriodDays: 7, now }),
    ).toBe("TRIAL");
    expect(advanceSubscriptionStatus({ status: "TRIAL", expiresAt: expires, gracePeriodDays: 7, now })).toBe("GRACE");
  });

  it("hides Pickee-internal subsidy from a provider finance view", () => {
    const view = providerFinanceFromRows([
      { entryType: "MERCHANDISE_GMV", amountVnd: 80_000, orderId: "o1", toParty: "PROVIDER" },
      { entryType: "PLATFORM_FEE", amountVnd: 2_400, orderId: "o1", toParty: "PICKEE" },
      { entryType: "PROVIDER_FUNDED_DISCOUNT", amountVnd: 5_000, orderId: "o1", toParty: "CUSTOMER" },
      { entryType: "PICKEE_DELIVERY_SUBSIDY", amountVnd: 20_000, orderId: "o1", toParty: "RUNNER" },
      { entryType: "SUBSCRIPTION_REVENUE", amountVnd: 99_000, orderId: null, toParty: "PICKEE" },
      { entryType: "PAYMENT_SENT", amountVnd: 10_000, orderId: null, toParty: "PROVIDER" },
    ]);
    expect(view.gmv).toBe(80_000);
    expect(view.netReceivable).toBe(80_000 - 5_000 - 2_400);
    expect(view.paid).toBe(10_000);
    expect(view.outstanding).toBe(view.netReceivable - 10_000);
    expect(JSON.stringify(view)).not.toContain("20000");
  });
});
