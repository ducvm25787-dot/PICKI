export const ledgerEntryTypes = [
  "MERCHANDISE_GMV",
  "CUSTOMER_DELIVERY_FEE",
  "PLATFORM_FEE",
  "RUNNER_PAYABLE",
  "PROVIDER_DELIVERY_SUBSIDY",
  "PICKEE_DELIVERY_SUBSIDY",
  "PROVIDER_FUNDED_DISCOUNT",
  "PICKEE_FUNDED_DISCOUNT",
  "PAYMENT_RECEIVED",
  "PAYMENT_SENT",
  "SUBSCRIPTION_REVENUE",
  "REFUND",
  "ADJUSTMENT",
  "REVERSAL",
] as const;

export type LedgerEntryType = (typeof ledgerEntryTypes)[number];

export type LedgerDraft = {
  id: string;
  entryType: LedgerEntryType;
  amountVnd: number;
  fromParty: string;
  toParty: string;
  orderId?: string | null;
  providerId?: string | null;
  providerLocationId?: string | null;
  zoneId?: string | null;
  cityId?: string | null;
  campaignId?: string | null;
  runnerUserId?: string | null;
  paymentId?: string | null;
  billingPaymentId?: string | null;
  sourceType: string;
  sourceId?: string | null;
  reversalOfId?: string | null;
  snapshot?: Record<string, unknown>;
};

export type PostedLedgerEntry = LedgerDraft & {
  status: "POSTED";
  postedAt: string;
};

export class LedgerBook {
  readonly entries: PostedLedgerEntry[] = [];

  post(draft: LedgerDraft, postedAt = new Date()): PostedLedgerEntry {
    if (draft.amountVnd < 0) throw new Error("Ledger amounts are non-negative");
    if (this.entries.some((entry) => entry.id === draft.id)) {
      throw new Error("Ledger entry already posted");
    }
    const posted: PostedLedgerEntry = {
      ...draft,
      status: "POSTED",
      postedAt: postedAt.toISOString(),
    };
    this.entries.push(posted);
    return posted;
  }

  reverse(entryId: string, reversalId: string, postedAt = new Date()): PostedLedgerEntry {
    const original = this.entries.find((entry) => entry.id === entryId);
    if (!original) throw new Error("Ledger entry not found");
    const before = original.amountVnd;
    const reversal = this.post(
      {
        ...original,
        id: reversalId,
        entryType: "REVERSAL",
        fromParty: original.toParty,
        toParty: original.fromParty,
        reversalOfId: original.id,
        sourceType: "REVERSAL",
        sourceId: original.id,
      },
      postedAt,
    );
    if (original.amountVnd !== before) throw new Error("Original ledger entry was mutated");
    return reversal;
  }
}

export function openingEconomicEntries(
  orderId: string,
  snapshot: {
    merchandiseGmv: number;
    customerDeliveryFee: number;
    providerDeliverySubsidy: number;
    pickeeDeliverySubsidy: number;
    runnerPayable: number;
    providerFundedDiscount: number;
    pickeeFundedDiscount: number;
  },
  parties: { providerId: string; locationId: string; zoneId: string; cityId: string | null },
): LedgerDraft[] {
  const base = {
    orderId,
    providerId: parties.providerId,
    providerLocationId: parties.locationId,
    zoneId: parties.zoneId,
    cityId: parties.cityId,
    sourceType: "ORDER",
    sourceId: orderId,
  };
  const lines: LedgerDraft[] = [];
  const push = (entryType: LedgerDraft["entryType"], amount: number, fromParty: string, toParty: string) => {
    if (amount <= 0) return;
    lines.push({
      id: `${orderId}:${entryType}`,
      entryType,
      amountVnd: amount,
      fromParty,
      toParty,
      ...base,
    });
  };
  push("MERCHANDISE_GMV", snapshot.merchandiseGmv, "CUSTOMER", "PROVIDER");
  push("CUSTOMER_DELIVERY_FEE", snapshot.customerDeliveryFee, "CUSTOMER", "PROVIDER");
  push("PROVIDER_FUNDED_DISCOUNT", snapshot.providerFundedDiscount, "PROVIDER", "CUSTOMER");
  push("PICKEE_FUNDED_DISCOUNT", snapshot.pickeeFundedDiscount, "PICKEE", "CUSTOMER");
  push("PROVIDER_DELIVERY_SUBSIDY", snapshot.providerDeliverySubsidy, "PROVIDER", "RUNNER");
  push("PICKEE_DELIVERY_SUBSIDY", snapshot.pickeeDeliverySubsidy, "PICKEE", "RUNNER");
  push("RUNNER_PAYABLE", snapshot.runnerPayable, "PROVIDER", "RUNNER");
  return lines;
}

export function feeRecognized(status: string): boolean {
  return status === "FULFILLED" || status === "FULFILLED_AFTER_CANCEL";
}

export function reconcilePickee(input: {
  transactionFee: number;
  subscriptionRevenue: number;
  pickeeFundedDiscount: number;
  pickeeDeliverySubsidy: number;
  pickeeRefunds: number;
}) {
  const inflow = input.transactionFee + input.subscriptionRevenue;
  const outflow = input.pickeeFundedDiscount + input.pickeeDeliverySubsidy + input.pickeeRefunds;
  const orderContribution = input.transactionFee - input.pickeeFundedDiscount - input.pickeeDeliverySubsidy;
  return {
    inflow,
    outflow,
    netContribution: inflow - outflow,
    platformRevenue: inflow,
    orderContribution,
    subscriptionRevenue: input.subscriptionRevenue,
  };
}
