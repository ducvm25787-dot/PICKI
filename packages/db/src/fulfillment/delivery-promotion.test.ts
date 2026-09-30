import { describe, expect, it } from "vitest";
import { applyDeliveryPromotion, canConsumePromotion } from "./delivery-promotion.js";
import { switchToSelfDelivery } from "./delivery-snapshot.js";

const openingWeek = {
  id: "promo-1",
  sponsorType: "PICKEE" as const,
  subsidyMode: "COVER_UP_TO" as const,
  maxSubsidyPerOrderVnd: 20_000,
  providerShareVnd: 0,
  pickeeShareVnd: 0,
  minimumOrderVnd: 0,
  eligibleModes: ["PICKEE_RUNNER"],
};

describe("applyDeliveryPromotion", () => {
  it("covers a 12k runner fee entirely when the cap is 20k", () => {
    const snap = applyDeliveryPromotion({
      baseVnd: 12_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: openingWeek,
    });
    expect(snap).toMatchObject({
      customerDeliveryFee: 0,
      pickeeDeliverySubsidy: 12_000,
      providerDeliverySubsidy: 0,
      runnerPayable: 12_000,
      deliveryFeeVnd: 0,
    });
  });

  it("caps Pickee at 20k when the runner fee is 30k", () => {
    const snap = applyDeliveryPromotion({
      baseVnd: 30_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: openingWeek,
    });
    expect(snap).toMatchObject({
      customerDeliveryFee: 10_000,
      pickeeDeliverySubsidy: 20_000,
      runnerPayable: 30_000,
      deliveryFeeVnd: 10_000,
    });
  });

  it("lets the shop fund a full freeship", () => {
    const snap = applyDeliveryPromotion({
      baseVnd: 15_000,
      subtotalVnd: 320_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: {
        ...openingWeek,
        sponsorType: "PROVIDER",
        maxSubsidyPerOrderVnd: 15_000,
        minimumOrderVnd: 300_000,
      },
    });
    expect(snap).toMatchObject({
      customerDeliveryFee: 0,
      providerDeliverySubsidy: 15_000,
      pickeeDeliverySubsidy: 0,
      runnerPayable: 15_000,
    });
  });

  it("splits a shared subsidy and leaves the runner payable at the base", () => {
    const snap = applyDeliveryPromotion({
      baseVnd: 20_000,
      subtotalVnd: 100_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: {
        ...openingWeek,
        sponsorType: "SHARED",
        subsidyMode: "SHARED_AMOUNTS",
        maxSubsidyPerOrderVnd: 10_000,
        providerShareVnd: 5_000,
        pickeeShareVnd: 5_000,
      },
    });
    expect(snap).toMatchObject({
      customerDeliveryFee: 10_000,
      providerDeliverySubsidy: 5_000,
      pickeeDeliverySubsidy: 5_000,
      runnerPayable: 20_000,
      deliveryFeeVnd: 10_000,
    });
  });

  it("does not give a Pickee subsidy to self-delivery unless the campaign allows it", () => {
    const blocked = applyDeliveryPromotion({
      baseVnd: 15_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PROVIDER_SELF_DELIVERY",
      promotion: openingWeek,
    });
    expect(blocked.pickeeDeliverySubsidy).toBe(0);
    expect(blocked.runnerPayable).toBe(0);
    expect(blocked.providerDeliveryEarning).toBe(15_000);

    const allowed = applyDeliveryPromotion({
      baseVnd: 15_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PROVIDER_SELF_DELIVERY",
      promotion: { ...openingWeek, eligibleModes: ["PICKEE_RUNNER", "PROVIDER_SELF_DELIVERY"] },
    });
    expect(allowed.pickeeDeliverySubsidy).toBe(15_000);
    expect(allowed.runnerPayable).toBe(0);
  });

  it("moves an existing Pickee subsidy onto the shop when self-delivery is not funded", () => {
    const funded = applyDeliveryPromotion({
      baseVnd: 15_000,
      subtotalVnd: 80_000,
      fulfillmentMode: "PICKEE_RUNNER",
      promotion: openingWeek,
    });
    const next = switchToSelfDelivery(funded);
    expect(next.pickeeDeliverySubsidy).toBe(0);
    expect(next.providerDeliverySubsidy).toBe(15_000);
    expect(next.runnerPayable).toBe(0);
    expect(next.customerDeliveryFee).toBe(0);
  });
});

describe("canConsumePromotion", () => {
  it("blocks the third order when the daily cap is 2", () => {
    expect(
      canConsumePromotion({
        usageLimitTotal: null,
        usageLimitPerUser: null,
        usageLimitPerUserPerDay: 2,
        totalUsed: 2,
        userUsed: 2,
        userUsedToday: 2,
        budgetVnd: null,
        budgetSpentVnd: 0,
        pickeeSubsidyVnd: 15_000,
      }),
    ).toBe(false);
  });

  it("blocks a subsidy that would pass the budget", () => {
    expect(
      canConsumePromotion({
        usageLimitTotal: null,
        usageLimitPerUser: null,
        usageLimitPerUserPerDay: null,
        totalUsed: 0,
        userUsed: 0,
        userUsedToday: 0,
        budgetVnd: 20_000,
        budgetSpentVnd: 12_000,
        pickeeSubsidyVnd: 15_000,
      }),
    ).toBe(false);
  });
});
