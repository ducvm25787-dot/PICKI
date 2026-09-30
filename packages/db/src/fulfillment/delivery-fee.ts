export type ZoneDeliveryFeeSettings = {
  foodDeliveryFeeVnd: number;
  foodDoorDeliveryFeeVnd: number;
  laundryReturnRunnerFeeVnd?: number;
};

export const DEFAULT_FOOD_DELIVERY_FEE_VND = 15_000;
export const DEFAULT_FOOD_DOOR_DELIVERY_FEE_VND = 20_000;
export const DEFAULT_LAUNDRY_RETURN_RUNNER_FEE_VND = 15_000;

export type CustomerDeliveryFeeInput = {
  serviceVertical: "FOOD" | "LAUNDRY";
  handoffMode?: "LOBBY_PICKUP" | "DOOR_DELIVERY" | null;
  zoneSettings?: ZoneDeliveryFeeSettings | null;
};

/** Customer-facing delivery fee snapshot (ADR-041). Laundry always 0. */
export function calculateCustomerDeliveryFeeVnd(input: CustomerDeliveryFeeInput): number {
  if (input.serviceVertical === "LAUNDRY") return 0;

  const lobby = input.zoneSettings?.foodDeliveryFeeVnd ?? DEFAULT_FOOD_DELIVERY_FEE_VND;
  const door = input.zoneSettings?.foodDoorDeliveryFeeVnd ?? DEFAULT_FOOD_DOOR_DELIVERY_FEE_VND;
  return input.handoffMode === "DOOR_DELIVERY" ? door : lobby;
}

export type ProviderRunnerFeeInput = {
  serviceVertical: "FOOD" | "LAUNDRY";
  leg?: "INBOUND" | "RETURN" | null;
  handoffMode?: "LOBBY_PICKUP" | "DOOR_DELIVERY" | null;
  zoneSettings?: ZoneDeliveryFeeSettings | null;
  fulfillmentMode?: "PICKEE_RUNNER" | "PROVIDER_SELF_DELIVERY" | "CUSTOMER_PICKUP" | null;
  /**
   * Runner compensation snapshot. Never the customer compatibility field
   * `delivery_fee_vnd`. V1 food often equals delivery_fee_base; laundry return
   * and later batch/incentive may differ.
   */
  runnerPayableVnd?: number | null;
};

/**
 * What the shop owes the runner.
 * Food reads `runnerPayableVnd`. Laundry return uses that snapshot once set,
 * otherwise the zone return rate as a preview before search.
 */
export function calculateProviderRunnerFeeVnd(input: ProviderRunnerFeeInput): number {
  if (
    input.fulfillmentMode === "PROVIDER_SELF_DELIVERY" ||
    input.fulfillmentMode === "CUSTOMER_PICKUP"
  ) {
    return 0;
  }

  if (input.serviceVertical === "LAUNDRY") {
    if (input.leg !== "RETURN") return 0;
    if (input.runnerPayableVnd != null && input.runnerPayableVnd > 0) {
      return input.runnerPayableVnd;
    }
    return input.zoneSettings?.laundryReturnRunnerFeeVnd ?? DEFAULT_LAUNDRY_RETURN_RUNNER_FEE_VND;
  }

  if (input.runnerPayableVnd != null) {
    return input.runnerPayableVnd;
  }

  return calculateCustomerDeliveryFeeVnd({
    serviceVertical: "FOOD",
    handoffMode: input.handoffMode,
    zoneSettings: input.zoneSettings,
  });
}
