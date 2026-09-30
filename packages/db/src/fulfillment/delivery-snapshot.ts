export const FULFILLMENT_MODES = [
  "PICKEE_RUNNER",
  "PROVIDER_SELF_DELIVERY",
  "CUSTOMER_PICKUP",
] as const;

export type FulfillmentMode = (typeof FULFILLMENT_MODES)[number];

/** Order delivery money. `deliveryFeeVnd` mirrors `customerDeliveryFee` for old readers. */
export type DeliveryFundingSnapshot = {
  fulfillmentMode: FulfillmentMode;
  deliveryFeeBase: number;
  customerDeliveryFee: number;
  providerDeliverySubsidy: number;
  pickeeDeliverySubsidy: number;
  runnerPayable: number;
  providerDeliveryEarning: number;
  deliveryFeeVnd: number;
};

export class DeliveryFundingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryFundingError";
  }
}

function assertNonNegative(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0) {
    throw new DeliveryFundingError(`${name} must be a non-negative integer VND`);
  }
}

/**
 * Service-layer identity. Not a database CHECK.
 * `runnerPayable` may differ from `deliveryFeeBase` (laundry return, later batch/incentive).
 */
export function assertDeliveryFundingSnapshot(snapshot: DeliveryFundingSnapshot): void {
  if (!FULFILLMENT_MODES.includes(snapshot.fulfillmentMode)) {
    throw new DeliveryFundingError("Invalid fulfillment mode");
  }
  assertNonNegative("deliveryFeeBase", snapshot.deliveryFeeBase);
  assertNonNegative("customerDeliveryFee", snapshot.customerDeliveryFee);
  assertNonNegative("providerDeliverySubsidy", snapshot.providerDeliverySubsidy);
  assertNonNegative("pickeeDeliverySubsidy", snapshot.pickeeDeliverySubsidy);
  assertNonNegative("runnerPayable", snapshot.runnerPayable);
  assertNonNegative("providerDeliveryEarning", snapshot.providerDeliveryEarning);
  assertNonNegative("deliveryFeeVnd", snapshot.deliveryFeeVnd);

  const funded =
    snapshot.customerDeliveryFee +
    snapshot.providerDeliverySubsidy +
    snapshot.pickeeDeliverySubsidy;
  if (funded !== snapshot.deliveryFeeBase) {
    throw new DeliveryFundingError(
      "customer + provider subsidy + pickee subsidy must equal delivery fee base",
    );
  }
  if (snapshot.deliveryFeeVnd !== snapshot.customerDeliveryFee) {
    throw new DeliveryFundingError("deliveryFeeVnd must mirror customerDeliveryFee");
  }

  if (snapshot.fulfillmentMode === "CUSTOMER_PICKUP") {
    if (
      snapshot.deliveryFeeBase !== 0 ||
      snapshot.runnerPayable !== 0 ||
      snapshot.providerDeliveryEarning !== 0
    ) {
      throw new DeliveryFundingError("Customer pickup has no delivery money");
    }
  }

  if (snapshot.fulfillmentMode === "PROVIDER_SELF_DELIVERY") {
    if (snapshot.runnerPayable !== 0) {
      throw new DeliveryFundingError("Self-delivery pays no runner");
    }
    if (snapshot.providerDeliveryEarning !== snapshot.customerDeliveryFee) {
      throw new DeliveryFundingError("Self-delivery earning is the fee the customer paid");
    }
  }

  if (snapshot.fulfillmentMode === "PICKEE_RUNNER" && snapshot.providerDeliveryEarning !== 0) {
    throw new DeliveryFundingError("Pickee runner delivery is not provider delivery income");
  }
}

/** V1 food runner job: customer pays the full base, runner payable equals base. */
export function snapshotPickeeRunner(baseVnd: number): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PICKEE_RUNNER",
    deliveryFeeBase: baseVnd,
    customerDeliveryFee: baseVnd,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: baseVnd,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: baseVnd,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

/** Shop delivers. Customer fee stays. Runner payable becomes 0. Shop keeps that fee. */
export function snapshotSelfDelivery(baseVnd: number): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PROVIDER_SELF_DELIVERY",
    deliveryFeeBase: baseVnd,
    customerDeliveryFee: baseVnd,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: 0,
    providerDeliveryEarning: baseVnd,
    deliveryFeeVnd: baseVnd,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

export function snapshotCustomerPickup(): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "CUSTOMER_PICKUP",
    deliveryFeeBase: 0,
    customerDeliveryFee: 0,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: 0,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: 0,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

/** Laundry checkout: customer pays no delivery. Return-runner payable is set later. */
export function snapshotLaundryCheckout(): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PICKEE_RUNNER",
    deliveryFeeBase: 0,
    customerDeliveryFee: 0,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: 0,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: 0,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

/** Laundry return search. Retail delivery price stays 0; runner compensation is separate. */
export function snapshotLaundryReturnRunner(runnerFeeVnd: number): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PICKEE_RUNNER",
    deliveryFeeBase: 0,
    customerDeliveryFee: 0,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: runnerFeeVnd,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: 0,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

export function snapshotLaundrySelfDelivery(): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: "PROVIDER_SELF_DELIVERY",
    deliveryFeeBase: 0,
    customerDeliveryFee: 0,
    providerDeliverySubsidy: 0,
    pickeeDeliverySubsidy: 0,
    runnerPayable: 0,
    providerDeliveryEarning: 0,
    deliveryFeeVnd: 0,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

/**
 * Leaving a runner job for self-delivery.
 * Pickee subsidy moves onto the shop unless the campaign explicitly funds self-delivery.
 */
export function switchToSelfDelivery(
  current: DeliveryFundingSnapshot,
  options?: { keepPickeeSubsidy?: boolean },
): DeliveryFundingSnapshot {
  const keepPickee = options?.keepPickeeSubsidy === true;
  const snapshot: DeliveryFundingSnapshot = {
    ...current,
    fulfillmentMode: "PROVIDER_SELF_DELIVERY",
    providerDeliverySubsidy: keepPickee
      ? current.providerDeliverySubsidy
      : current.providerDeliverySubsidy + current.pickeeDeliverySubsidy,
    pickeeDeliverySubsidy: keepPickee ? current.pickeeDeliverySubsidy : 0,
    runnerPayable: 0,
    providerDeliveryEarning: current.customerDeliveryFee,
    deliveryFeeVnd: current.customerDeliveryFee,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}

export function fundingFromOrder(order: {
  fulfillmentMode: string;
  deliveryFeeBase: number;
  customerDeliveryFee: number;
  providerDeliverySubsidy: number;
  pickeeDeliverySubsidy: number;
  runnerPayable: number;
  providerDeliveryEarning: number;
  deliveryFeeVnd: number;
}): DeliveryFundingSnapshot {
  const snapshot: DeliveryFundingSnapshot = {
    fulfillmentMode: order.fulfillmentMode as FulfillmentMode,
    deliveryFeeBase: order.deliveryFeeBase,
    customerDeliveryFee: order.customerDeliveryFee,
    providerDeliverySubsidy: order.providerDeliverySubsidy,
    pickeeDeliverySubsidy: order.pickeeDeliverySubsidy,
    runnerPayable: order.runnerPayable,
    providerDeliveryEarning: order.providerDeliveryEarning,
    deliveryFeeVnd: order.deliveryFeeVnd,
  };
  assertDeliveryFundingSnapshot(snapshot);
  return snapshot;
}
