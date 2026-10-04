export const commercialStandings = ["NORMAL", "WATCH", "WARNED", "RESTRICTED", "BLOCKED"] as const;
export type CommercialStanding = (typeof commercialStandings)[number];

export type CommerceEligibility = {
  canLogin: boolean;
  canRenewSubscription: boolean;
  canAcceptNewCommerce: boolean;
  hiddenFromDiscovery: boolean;
  canCreateCampaign: boolean;
  reasons: string[];
};

export function commerceEligibility(input: {
  operationalStatus: string;
  subscriptionStatus: string | null;
  subscriptionRequired: boolean;
  commercialStanding: CommercialStanding;
  memberRole?: string | null;
}): CommerceEligibility {
  const reasons: string[] = [];
  const operationalOpen = input.operationalStatus === "ACTIVE";
  if (!operationalOpen) reasons.push("operational");

  const subscriptionOk =
    !input.subscriptionRequired ||
    input.subscriptionStatus === "TRIAL" ||
    input.subscriptionStatus === "ACTIVE" ||
    input.subscriptionStatus === "GRACE" ||
    input.subscriptionStatus === "PAST_DUE";
  if (!subscriptionOk) reasons.push("subscription");

  const standingBlocks = input.commercialStanding === "BLOCKED" || input.commercialStanding === "RESTRICTED";
  if (standingBlocks) reasons.push("commercial");

  const role = input.memberRole ?? "OWNER";
  return {
    canLogin: true,
    canRenewSubscription: role === "OWNER" || role === "MANAGER",
    canAcceptNewCommerce: operationalOpen && subscriptionOk && !standingBlocks,
    hiddenFromDiscovery: input.commercialStanding === "BLOCKED" || (!subscriptionOk && input.subscriptionRequired),
    canCreateCampaign: operationalOpen && subscriptionOk && input.commercialStanding === "NORMAL",
    reasons,
  };
}

export function payingSubscriptionClearsStanding(before: CommercialStanding): CommercialStanding {
  return before;
}

const EXPOSURE_KINDS = new Set(["HERO_PRODUCT", "TODAY_FEATURE", "CONTENT_CAMPAIGN"]);

export type CampaignAttributionRow = {
  orderId: string;
  campaignId: string;
  kind: string;
  gmv: number;
  providerFundedDiscount: number;
  pickeeFundedDiscount: number;
  providerDeliverySubsidy: number;
  pickeeDeliverySubsidy: number;
  transactionFee: number;
  refund: number;
};

export function aggregateCampaignFinance(rows: readonly CampaignAttributionRow[]) {
  const byCampaign = new Map<
    string,
    {
      orders: Set<string>;
      gmv: number;
      providerFundedDiscount: number;
      pickeeFundedDiscount: number;
      providerDeliverySubsidy: number;
      pickeeDeliverySubsidy: number;
      platformRevenue: number;
      refund: number;
    }
  >();
  const seenOrders = new Set<string>();
  let pickeeWideGmv = 0;
  for (const row of rows) {
    if (!seenOrders.has(row.orderId)) {
      seenOrders.add(row.orderId);
      pickeeWideGmv += row.gmv;
    }
    const financial = !EXPOSURE_KINDS.has(row.kind);
    const current = byCampaign.get(row.campaignId) ?? {
      orders: new Set<string>(),
      gmv: 0,
      providerFundedDiscount: 0,
      pickeeFundedDiscount: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      platformRevenue: 0,
      refund: 0,
    };
    current.orders.add(row.orderId);
    current.gmv += row.gmv;
    if (financial) {
      current.providerFundedDiscount += row.providerFundedDiscount;
      current.pickeeFundedDiscount += row.pickeeFundedDiscount;
      current.providerDeliverySubsidy += row.providerDeliverySubsidy;
      current.pickeeDeliverySubsidy += row.pickeeDeliverySubsidy;
      current.platformRevenue += row.transactionFee;
      current.refund += row.refund;
    }
    byCampaign.set(row.campaignId, current);
  }
  return {
    pickeeWideGmv,
    campaigns: [...byCampaign.entries()].map(([campaignId, value]) => ({
      campaignId,
      orders: value.orders.size,
      gmv: value.gmv,
      providerFundedDiscount: value.providerFundedDiscount,
      pickeeFundedDiscount: value.pickeeFundedDiscount,
      providerDeliverySubsidy: value.providerDeliverySubsidy,
      pickeeDeliverySubsidy: value.pickeeDeliverySubsidy,
      platformRevenue: value.platformRevenue,
      refund: value.refund,
      netContribution:
        value.platformRevenue -
        value.pickeeFundedDiscount -
        value.pickeeDeliverySubsidy -
        value.refund,
    })),
  };
}

export type RiskSignalInput = {
  acceptedThenCancelled: number;
  lateCancel: number;
  runnerAssignedThenCancelled: number;
  customerConfirmedAfterCancel: number;
  suspectedOffPlatform: number;
  confirmedOffPlatform: number;
};

export function riskStandingFromSignals(_signals: RiskSignalInput): "NORMAL" {
  return "NORMAL";
}
