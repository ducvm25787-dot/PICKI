import type { DeliveryFundingSnapshot, FulfillmentMode } from "./delivery-snapshot.js";

export const RUNNER_ASSIGNMENT_STATUSES = [
  "RUNNER_ASSIGNED",
  "PICKED_UP",
  "RETURN_RUNNER_ASSIGNED",
  "RETURN_PICKED_UP",
] as const;

const COOK_FIRST_KINDS = new Set(["FAMILY_DINNER", "LATE_DINNER", "BREAKFAST_PREORDER"]);

export type HistoricalOrderEvidence = {
  serviceVertical: string;
  orderKind: string | null;
  status: string;
  laundryPickupMode?: string | null;
  runnerUserId: string | null;
  runnerSoughtAt: Date | string | null;
  /** Value of delivery_fee_vnd before this backfill. Laundry may have stored the runner fee here. */
  legacyDeliveryFeeVnd: number;
  /** to_status values from order_status_history */
  assignmentStatuses: string[];
  hasAcceptedOffer: boolean;
};

export type HistoricalFulfillmentDecision = DeliveryFundingSnapshot & {
  ambiguous: boolean;
  reason: string;
};

export function hasRunnerAssignmentEvidence(evidence: HistoricalOrderEvidence): boolean {
  if (evidence.runnerUserId) return true;
  if (
    RUNNER_ASSIGNMENT_STATUSES.includes(
      evidence.status as (typeof RUNNER_ASSIGNMENT_STATUSES)[number],
    )
  ) {
    return true;
  }
  if (
    evidence.assignmentStatuses.some((status) =>
      RUNNER_ASSIGNMENT_STATUSES.includes(
        status as (typeof RUNNER_ASSIGNMENT_STATUSES)[number],
      ),
    )
  ) {
    return true;
  }
  return evidence.hasAcceptedOffer;
}

function isCookFirst(evidence: HistoricalOrderEvidence): boolean {
  return (
    evidence.serviceVertical !== "LAUNDRY" &&
    COOK_FIRST_KINDS.has(evidence.orderKind ?? "")
  );
}

/**
 * Historical mode. `runner_sought_at` alone never means a Pickee runner delivered the order.
 * Priority: runner_user_id / assignment history / runner-specific status / accepted offer,
 * then cook-first DELIVERING|DELIVERED with no runner, then laundry staff return.
 */
export function decideHistoricalFulfillment(
  evidence: HistoricalOrderEvidence,
): HistoricalFulfillmentDecision {
  const runner = hasRunnerAssignmentEvidence(evidence);
  const cookFirst = isCookFirst(evidence);
  const foodSelf =
    !runner &&
    cookFirst &&
    evidence.runnerUserId == null &&
    (evidence.status === "DELIVERING" || evidence.status === "DELIVERED");
  const laundrySelf =
    !runner &&
    evidence.serviceVertical === "LAUNDRY" &&
    evidence.runnerUserId == null &&
    (evidence.status === "RETURN_DELIVERING" || evidence.status === "COMPLETED") &&
    evidence.laundryPickupMode !== "ON_SITE";
  const ambiguous =
    !runner &&
    !foodSelf &&
    !laundrySelf &&
    evidence.serviceVertical !== "LAUNDRY" &&
    !cookFirst &&
    evidence.runnerUserId == null &&
    (evidence.status === "DELIVERING" || evidence.status === "DELIVERED");

  let fulfillmentMode: FulfillmentMode = "PICKEE_RUNNER";
  if (foodSelf || laundrySelf) fulfillmentMode = "PROVIDER_SELF_DELIVERY";

  const legacy = evidence.legacyDeliveryFeeVnd;
  const laundry = evidence.serviceVertical === "LAUNDRY";
  const customerDeliveryFee = laundry ? 0 : legacy;
  const deliveryFeeBase = laundry ? 0 : legacy;

  let runnerPayable = 0;
  let providerDeliveryEarning = 0;
  let reason = "food_runner_intent";

  if (runner) {
    runnerPayable = legacy;
    reason = "runner_assignment_evidence";
  } else if (foodSelf) {
    providerDeliveryEarning = customerDeliveryFee;
    reason = "cook_first_delivered_without_runner";
  } else if (laundrySelf) {
    reason = "laundry_staff_return";
  } else if (ambiguous) {
    reason = "ambiguous_delivered_without_runner_evidence";
  } else if (
    laundry &&
    evidence.status === "READY_FOR_RETURN" &&
    evidence.runnerSoughtAt &&
    evidence.runnerUserId == null
  ) {
    runnerPayable = legacy;
    reason = "laundry_return_search_in_progress";
  } else if (laundry) {
    reason = "laundry_no_runner_payable";
  } else {
    runnerPayable = legacy;
    reason = "food_runner_intent";
  }

  return {
    fulfillmentMode,
    deliveryFeeBase,
    customerDeliveryFee,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable,
    providerDeliveryEarning,
    deliveryFeeVnd: customerDeliveryFee,
    ambiguous,
    reason,
  };
}
