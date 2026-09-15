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
  /** Food order snapshot at checkout */
  orderDeliveryFeeVnd?: number | null;
};

/**
 * Fee provider pays runner (shown on find-runner / runner pool).
 * Food: matches customer delivery fee. Laundry return: zone flat rate.
 */
export function calculateProviderRunnerFeeVnd(input: ProviderRunnerFeeInput): number {
  if (input.serviceVertical === "LAUNDRY") {
    if (input.leg === "RETURN") {
      return (
        input.zoneSettings?.laundryReturnRunnerFeeVnd ?? DEFAULT_LAUNDRY_RETURN_RUNNER_FEE_VND
      );
    }
    return 0;
  }

  if (input.orderDeliveryFeeVnd != null && input.orderDeliveryFeeVnd > 0) {
    return input.orderDeliveryFeeVnd;
  }

  return calculateCustomerDeliveryFeeVnd({
    serviceVertical: "FOOD",
    handoffMode: input.handoffMode,
    zoneSettings: input.zoneSettings,
  });
}
