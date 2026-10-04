import { describe, expect, it } from "vitest";
import {
  assertDeliveryFundingSnapshot,
  customerDeliveryChargeVnd,
  snapshotCustomerPickup,
  snapshotLaundryReturnRunner,
  snapshotPickeeRunner,
  snapshotSelfDelivery,
  switchToSelfDelivery,
} from "./delivery-snapshot.js";

describe("delivery funding snapshots", () => {
  it("Pickee runner: customer pays the base and runner payable matches in V1", () => {
    const snap = snapshotPickeeRunner(15_000);
    expect(snap).toMatchObject({
      fulfillmentMode: "PICKEE_RUNNER",
      deliveryFeeBase: 15_000,
      customerDeliveryFee: 15_000,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 15_000,
      providerDeliveryEarning: 0,
      deliveryFeeVnd: 15_000,
    });
  });

  it("self-delivery: runner payable is 0 and the shop keeps the customer fee", () => {
    const snap = snapshotSelfDelivery(15_000);
    expect(snap).toMatchObject({
      fulfillmentMode: "PROVIDER_SELF_DELIVERY",
      deliveryFeeBase: 15_000,
      customerDeliveryFee: 15_000,
      runnerPayable: 0,
      providerDeliveryEarning: 15_000,
      deliveryFeeVnd: 15_000,
    });
  });

  it("customer pickup zeroes every delivery amount", () => {
    const snap = snapshotCustomerPickup();
    expect(snap).toMatchObject({
      fulfillmentMode: "CUSTOMER_PICKUP",
      deliveryFeeBase: 0,
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 0,
      providerDeliveryEarning: 0,
      deliveryFeeVnd: 0,
    });
  });

  it("allows runner payable to differ from the retail delivery base", () => {
    const snap = snapshotLaundryReturnRunner(15_000);
    expect(snap.deliveryFeeBase).toBe(0);
    expect(snap.customerDeliveryFee).toBe(0);
    expect(snap.deliveryFeeVnd).toBe(0);
    expect(snap.runnerPayable).toBe(15_000);
    expect(() => assertDeliveryFundingSnapshot(snap)).not.toThrow();
  });

  it("moves a Pickee subsidy onto the shop when switching to self-delivery", () => {
    const next = switchToSelfDelivery({
      fulfillmentMode: "PICKEE_RUNNER",
      deliveryFeeBase: 15_000,
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 0,
      pickeeDeliverySubsidy: 15_000,
      runnerPayable: 15_000,
      providerDeliveryEarning: 0,
      deliveryFeeVnd: 0,
    });
    expect(next.fulfillmentMode).toBe("PROVIDER_SELF_DELIVERY");
    expect(next.pickeeDeliverySubsidy).toBe(0);
    expect(next.providerDeliverySubsidy).toBe(15_000);
    expect(next.runnerPayable).toBe(0);
    expect(next.providerDeliveryEarning).toBe(0);
    expect(next.deliveryFeeVnd).toBe(0);
  });

  it("adds only the runner amount above the funded base onto the customer total", () => {
    expect(
      customerDeliveryChargeVnd({
        customerDeliveryFee: 0,
        deliveryFeeBase: 20_000,
        runnerPayable: 28_000,
      }),
    ).toBe(8_000);
    expect(
      customerDeliveryChargeVnd({
        customerDeliveryFee: 0,
        deliveryFeeBase: 20_000,
        runnerPayable: 20_000,
      }),
    ).toBe(0);
    expect(
      customerDeliveryChargeVnd({
        customerDeliveryFee: 20_000,
        deliveryFeeBase: 20_000,
        runnerPayable: 28_000,
      }),
    ).toBe(28_000);
  });
});
