import { describe, expect, it } from "vitest";
import { memberCoversLocation } from "./member-access.js";

const provider = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const location = "33333333-3333-4333-8333-333333333333";
const zone = "44444444-4444-4444-8444-444444444444";
const city = "55555555-5555-4555-8555-555555555555";

const base = {
  providerId: provider,
  locationId: location,
  locationProviderId: provider,
  zoneIds: [zone],
  cityIds: [city],
};

describe("memberCoversLocation", () => {
  it("lets a brand-wide member see every location of that provider", () => {
    expect(
      memberCoversLocation({ ...base, scopeType: "PROVIDER", scopeId: provider }),
    ).toBe(true);
  });

  it("refuses another provider even with a matching location id", () => {
    expect(
      memberCoversLocation({
        ...base,
        providerId: other,
        scopeType: "LOCATION",
        scopeId: location,
      }),
    ).toBe(false);
  });

  it("limits a zone manager to locations that serve that zone", () => {
    expect(memberCoversLocation({ ...base, scopeType: "ZONE", scopeId: zone })).toBe(true);
    expect(
      memberCoversLocation({ ...base, scopeType: "ZONE", scopeId: other, zoneIds: [zone] }),
    ).toBe(false);
  });

  it("limits a city manager to locations whose zones are in that city", () => {
    expect(memberCoversLocation({ ...base, scopeType: "CITY", scopeId: city })).toBe(true);
    expect(memberCoversLocation({ ...base, scopeType: "CITY", scopeId: other })).toBe(false);
  });

  it("keeps a zone manager inside one provider even when another shop serves the same zone", () => {
    const otherLocation = "66666666-6666-4666-8666-666666666666";
    expect(
      memberCoversLocation({
        ...base,
        scopeType: "ZONE",
        scopeId: zone,
        locationId: otherLocation,
        locationProviderId: other,
      }),
    ).toBe(false);
  });

  it("keeps a city manager inside one provider even when another shop is in the same city", () => {
    expect(
      memberCoversLocation({
        ...base,
        providerId: provider,
        scopeType: "CITY",
        scopeId: city,
        locationProviderId: other,
      }),
    ).toBe(false);
  });
});
