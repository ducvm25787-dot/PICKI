export const revenueModels = ["FREE", "SUBSCRIPTION", "TRANSACTION_FEE", "HYBRID", "ENTERPRISE"] as const;
export type RevenueModel = (typeof revenueModels)[number];

export const transactionFeeTypes = ["NONE", "PERCENT", "FIXED"] as const;
export type TransactionFeeType = (typeof transactionFeeTypes)[number];

export const transactionFeeBases = [
  "MERCHANDISE_GMV",
  "MERCHANDISE_AFTER_PROVIDER_DISCOUNT",
  "ORDER_FIXED",
] as const;
export type TransactionFeeBasis = (typeof transactionFeeBases)[number];

export const policySources = ["DEFAULT", "CONTRACT", "PROMOTION", "MANUAL_OVERRIDE"] as const;
export type PolicySource = (typeof policySources)[number];

export const commercialScopes = ["SYSTEM", "PROVIDER_TYPE", "PROVIDER", "CITY", "ZONE", "LOCATION"] as const;
export type CommercialScope = (typeof commercialScopes)[number];

const SCOPE_RANK: Record<CommercialScope, number> = {
  LOCATION: 6,
  ZONE: 5,
  CITY: 4,
  PROVIDER: 3,
  PROVIDER_TYPE: 2,
  SYSTEM: 1,
};

export type CommercialPolicy = {
  id: string;
  version: number;
  scopeType: CommercialScope;
  scopeKey: string;
  revenueModel: RevenueModel;
  subscriptionRequired: boolean;
  transactionFeeType: TransactionFeeType;
  transactionFeeValue: number;
  transactionFeeBasis: TransactionFeeBasis;
  policySource: PolicySource;
  note: string | null;
  contractRef: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

export type CommercialContext = {
  providerType: string;
  providerId: string;
  cityId: string | null;
  zoneId: string | null;
  locationId: string | null;
};

export const FREE_POLICY: Omit<CommercialPolicy, "id" | "effectiveFrom" | "effectiveTo"> = {
  version: 0,
  scopeType: "SYSTEM",
  scopeKey: "",
  revenueModel: "FREE",
  subscriptionRequired: false,
  transactionFeeType: "NONE",
  transactionFeeValue: 0,
  transactionFeeBasis: "MERCHANDISE_GMV",
  policySource: "DEFAULT",
  note: null,
  contractRef: null,
};

export function resolveCommercialPolicy(
  policies: readonly CommercialPolicy[],
  context: CommercialContext,
  at: Date,
): CommercialPolicy | null {
  const matches = policies.filter((policy) => {
    if (policy.effectiveFrom.getTime() > at.getTime()) return false;
    if (policy.effectiveTo && policy.effectiveTo.getTime() <= at.getTime()) return false;
    return scopeMatches(policy, context);
  });
  matches.sort((a, b) => SCOPE_RANK[b.scopeType] - SCOPE_RANK[a.scopeType] || b.version - a.version);
  return matches[0] ?? null;
}

export function policyResolutionLabel(policy: CommercialPolicy | null): string {
  if (!policy || policy.version === 0) return "Mặc định FREE — chưa có hợp đồng";
  const source: Record<PolicySource, string> = {
    DEFAULT: "mặc định",
    CONTRACT: "hợp đồng",
    PROMOTION: "khuyến mại",
    MANUAL_OVERRIDE: "ghi đè thủ công",
  };
  const scope =
    policy.scopeType === "SYSTEM"
      ? "hệ thống"
      : policy.scopeType === "PROVIDER_TYPE"
        ? `loại ${policy.scopeKey}`
        : policy.scopeType === "PROVIDER"
          ? "hợp đồng nhà cung cấp"
          : policy.scopeType === "CITY"
            ? "thành phố"
            : policy.scopeType === "ZONE"
              ? "khu vực"
              : "điểm bán";
  return `${scope} · ${source[policy.policySource]} · v${policy.version}`;
}

function scopeMatches(policy: CommercialPolicy, context: CommercialContext): boolean {
  switch (policy.scopeType) {
    case "SYSTEM":
      return policy.scopeKey === "";
    case "PROVIDER_TYPE":
      return policy.scopeKey === context.providerType;
    case "PROVIDER":
      return policy.scopeKey === context.providerId;
    case "CITY":
      return context.cityId != null && policy.scopeKey === context.cityId;
    case "ZONE":
      return context.zoneId != null && policy.scopeKey === context.zoneId;
    case "LOCATION":
      return context.locationId != null && policy.scopeKey === context.locationId;
    default:
      return false;
  }
}

/** Percent values are basis points: 300 = 3.00%. Subscription-only and FREE never charge a transaction fee. */
export function transactionFeeAmount(input: {
  revenueModel: RevenueModel;
  transactionFeeType: TransactionFeeType;
  transactionFeeValue: number;
  transactionFeeBasis: TransactionFeeBasis;
  merchandiseGmv: number;
  providerFundedDiscount: number;
}): number {
  if (input.revenueModel === "FREE" || input.revenueModel === "SUBSCRIPTION") return 0;
  if (input.transactionFeeType === "NONE") return 0;
  if (input.transactionFeeType === "FIXED" || input.transactionFeeBasis === "ORDER_FIXED") {
    return input.transactionFeeValue;
  }
  const basis =
    input.transactionFeeBasis === "MERCHANDISE_AFTER_PROVIDER_DISCOUNT"
      ? Math.max(0, input.merchandiseGmv - input.providerFundedDiscount)
      : input.merchandiseGmv;
  return Math.floor((basis * input.transactionFeeValue) / 10_000);
}

export type OrderFinancialSnapshot = {
  version: "p5";
  merchandiseGmv: number;
  customerDeliveryFee: number;
  providerDeliverySubsidy: number;
  pickeeDeliverySubsidy: number;
  runnerPayable: number;
  providerFundedDiscount: number;
  pickeeFundedDiscount: number;
  commercialModel: RevenueModel;
  transactionFeeType: TransactionFeeType;
  transactionFeeValue: number;
  transactionFeeBasis: TransactionFeeBasis;
  transactionFeeAmount: number;
  commercialPolicyId: string | null;
  commercialPolicyVersion: number | null;
  policySource: PolicySource | null;
  policyScopeType: CommercialScope | null;
  policyScopeKey: string | null;
  contractRef: string | null;
  note: string | null;
  providerNetReceivable: number;
  pickeeOrderContribution: number;
  customerPays: number;
};

export function buildOrderFinancialSnapshot(input: {
  merchandiseGmv: number;
  customerDeliveryFee: number;
  providerDeliverySubsidy: number;
  pickeeDeliverySubsidy: number;
  runnerPayable: number;
  providerFundedDiscount: number;
  pickeeFundedDiscount: number;
  customerPays: number;
  policy: CommercialPolicy | null;
}): OrderFinancialSnapshot {
  const policy = input.policy;
  const fee = transactionFeeAmount({
    revenueModel: policy?.revenueModel ?? "FREE",
    transactionFeeType: policy?.transactionFeeType ?? "NONE",
    transactionFeeValue: policy?.transactionFeeValue ?? 0,
    transactionFeeBasis: policy?.transactionFeeBasis ?? "MERCHANDISE_GMV",
    merchandiseGmv: input.merchandiseGmv,
    providerFundedDiscount: input.providerFundedDiscount,
  });
  return {
    version: "p5",
    merchandiseGmv: input.merchandiseGmv,
    customerDeliveryFee: input.customerDeliveryFee,
    providerDeliverySubsidy: input.providerDeliverySubsidy,
    pickeeDeliverySubsidy: input.pickeeDeliverySubsidy,
    runnerPayable: input.runnerPayable,
    providerFundedDiscount: input.providerFundedDiscount,
    pickeeFundedDiscount: input.pickeeFundedDiscount,
    commercialModel: policy?.revenueModel ?? "FREE",
    transactionFeeType: fee === 0 ? "NONE" : (policy?.transactionFeeType ?? "NONE"),
    transactionFeeValue: policy?.transactionFeeValue ?? 0,
    transactionFeeBasis: policy?.transactionFeeBasis ?? "MERCHANDISE_GMV",
    transactionFeeAmount: fee,
    commercialPolicyId: policy?.id ?? null,
    commercialPolicyVersion: policy?.version ?? null,
    policySource: policy?.policySource ?? null,
    policyScopeType: policy?.scopeType ?? null,
    policyScopeKey: policy?.scopeKey ?? null,
    contractRef: policy?.contractRef ?? null,
    note: policy?.note ?? null,
    providerNetReceivable:
      input.merchandiseGmv - input.providerFundedDiscount - fee - input.providerDeliverySubsidy,
    pickeeOrderContribution: fee - input.pickeeFundedDiscount - input.pickeeDeliverySubsidy,
    customerPays: input.customerPays,
  };
}

export function providerEconomics(snapshot: OrderFinancialSnapshot) {
  return {
    customerPays: snapshot.customerPays,
    providerGross: snapshot.merchandiseGmv,
    providerNetReceivable: snapshot.providerNetReceivable,
    runnerPayable: snapshot.runnerPayable,
    pickeeFundedAmount: snapshot.pickeeFundedDiscount + snapshot.pickeeDeliverySubsidy,
    providerFundedAmount: snapshot.providerFundedDiscount + snapshot.providerDeliverySubsidy,
    pickeePlatformRevenue: snapshot.transactionFeeAmount,
    pickeeOrderContribution: snapshot.pickeeOrderContribution,
  };
}
