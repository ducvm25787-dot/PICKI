import type { DeliveryFundingSnapshot, FulfillmentMode } from "./delivery-snapshot.js";
import {
  assertDeliveryFundingSnapshot,
  snapshotCustomerPickup,
  snapshotPickeeRunner,
  snapshotSelfDelivery,
} from "./delivery-snapshot.js";

export type DeliverySponsorType = "PROVIDER" | "PICKEE" | "SHARED";
export type DeliverySubsidyMode = "COVER_UP_TO" | "SHARED_AMOUNTS";

export type DeliveryPromotionRule = {
  id: string;
  sponsorType: DeliverySponsorType;
  subsidyMode: DeliverySubsidyMode;
  maxSubsidyPerOrderVnd: number;
  providerShareVnd: number;
  pickeeShareVnd: number;
  minimumOrderVnd: number;
  eligibleModes: readonly string[];
};

export function parseEligibleModes(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function applyDeliveryPromotion(input: {
  baseVnd: number;
  subtotalVnd: number;
  fulfillmentMode: FulfillmentMode;
  promotion: DeliveryPromotionRule | null;
}): DeliveryFundingSnapshot {
  if (input.fulfillmentMode === "CUSTOMER_PICKUP") {
    return snapshotCustomerPickup();
  }

  const bare =
    input.fulfillmentMode === "PROVIDER_SELF_DELIVERY"
      ? () => snapshotSelfDelivery(input.baseVnd)
      : () => snapshotPickeeRunner(input.baseVnd);

  const promotion = input.promotion;
  if (
    !promotion ||
    input.subtotalVnd < promotion.minimumOrderVnd ||
    !promotion.eligibleModes.includes(input.fulfillmentMode)
  ) {
    return bare();
  }

  let provider = 0;
  let pickee = 0;
  if (promotion.subsidyMode === "COVER_UP_TO") {
    const subsidy = Math.min(input.baseVnd, promotion.maxSubsidyPerOrderVnd);
    if (promotion.sponsorType === "PROVIDER") provider = subsidy;
    else if (promotion.sponsorType === "PICKEE") pickee = subsidy;
  } else {
    provider = Math.min(promotion.providerShareVnd, input.baseVnd);
    pickee = Math.min(promotion.pickeeShareVnd, input.baseVnd - provider);
    let over = provider + pickee - promotion.maxSubsidyPerOrderVnd;
    if (over > 0) {
      const cutPickee = Math.min(pickee, over);
      pickee -= cutPickee;
      over -= cutPickee;
      provider -= Math.min(provider, over);
    }
  }

  const customer = input.baseVnd - provider - pickee;
  if (input.fulfillmentMode === "PROVIDER_SELF_DELIVERY") {
    const snapshot: DeliveryFundingSnapshot = {
      fulfillmentMode: "PROVIDER_SELF_DELIVERY",
      deliveryFeeBase: input.baseVnd,
      customerDeliveryFee: customer,
      providerDeliverySubsidy: provider,
      pickeeDeliverySubsidy: pickee,
      runnerPayable: 0,
      providerDeliveryEarning: customer,
      deliveryFeeVnd: customer,
    };
    assertDeliveryFundingSnapshot(snapshot);
    return snapshot;
  }

  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PICKEE_RUNNER",
    deliveryFeeBase: input.baseVnd,
    customerDeliveryFee: customer,
    providerDeliverySubsidy: provider,
    pickeeDeliverySubsidy: pickee,
    runnerPayable: input.baseVnd,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: customer,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

export function canConsumePromotion(input: {
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  usageLimitPerUserPerDay: number | null;
  totalUsed: number;
  userUsed: number;
  userUsedToday: number;
  budgetVnd: number | null;
  budgetSpentVnd: number;
  pickeeSubsidyVnd: number;
}): boolean {
  if (input.usageLimitTotal != null && input.totalUsed >= input.usageLimitTotal) return false;
  if (input.usageLimitPerUser != null && input.userUsed >= input.usageLimitPerUser) return false;
  if (
    input.usageLimitPerUserPerDay != null &&
    input.userUsedToday >= input.usageLimitPerUserPerDay
  ) {
    return false;
  }
  if (
    input.budgetVnd != null &&
    input.budgetSpentVnd + input.pickeeSubsidyVnd > input.budgetVnd
  ) {
    return false;
  }
  return true;
}

export function customerFeeOf(snapshot: DeliveryFundingSnapshot): number {
  return snapshot.customerDeliveryFee;
}
