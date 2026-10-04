import {
  CHAIN_CONSOLE_ROUTES,
  chainConsoleHref,
  chainScopeIsWider,
  parseChainScopeQuery,
  resolveStickyChainScope,
} from "@picki/shared";
import { describe, expect, it } from "vitest";
import {
  canEditSharedCatalog,
  canGrantMember,
  distinctLocationIds,
  locationsInScope,
  orderMatchesScope,
  scopeChoices,
  showChainConsole,
  type ChainGrant,
  type ChainLocation,
} from "./chain-scope.js";

const provider = "p-chain";
const otherProvider = "p-other";
const hanoi = "city-hn";
const south = "city-south";
const kimVan = "zone-kv";
const daiKim = "zone-dk";
const linhDam = "zone-ld";
const ecoZone = "zone-eco";
const ct12 = "loc-ct12";
const hh1 = "loc-hh1";
const eco = "loc-eco";
const otherLoc = "loc-other";

const locations: ChainLocation[] = [
  { id: ct12, providerId: provider, zones: [{ id: kimVan, cityId: hanoi }, { id: daiKim, cityId: hanoi }] },
  { id: hh1, providerId: provider, zones: [{ id: linhDam, cityId: hanoi }] },
  { id: eco, providerId: provider, zones: [{ id: ecoZone, cityId: south }] },
  { id: otherLoc, providerId: otherProvider, zones: [{ id: kimVan, cityId: hanoi }] },
];

const labels = {
  providers: { [provider]: "Demo Chain", [otherProvider]: "Quán khác" },
  cities: { [hanoi]: "Hà Nội", [south]: "Miền khác" },
  zones: {
    [kimVan]: "Kim Văn – Kim Lũ",
    [daiKim]: "Đại Kim",
    [linhDam]: "Linh Đàm",
    [ecoZone]: "Eco Zone",
  },
  locations: { [ct12]: "CT12", [hh1]: "HH1", [eco]: "EcoGreen", [otherLoc]: "Quán khác" },
};

function grant(partial: Partial<ChainGrant> & Pick<ChainGrant, "scopeType" | "scopeId">): ChainGrant {
  return { providerId: provider, role: "MANAGER", ...partial };
}

describe("chain console scope", () => {
  it("shows the console only when the user can see more than one location", () => {
    expect(showChainConsole([ct12, hh1, eco])).toBe(true);
    expect(showChainConsole([ct12])).toBe(false);
    expect(showChainConsole([ct12, ct12])).toBe(false);
  });

  it("lets HQ see all three locations and hides the other provider", () => {
    const ids = locationsInScope([grant({ scopeType: "PROVIDER", scopeId: provider, role: "OWNER" })], locations, {
      scopeType: "PROVIDER",
      scopeId: provider,
    })?.map((location) => location.id);
    expect(ids).toEqual([ct12, hh1, eco]);
  });

  it("lets a Hanoi manager see Hanoi locations once", () => {
    const rows = locationsInScope([grant({ scopeType: "CITY", scopeId: hanoi })], locations, {
      scopeType: "CITY",
      scopeId: hanoi,
    });
    expect(distinctLocationIds(rows ?? [])).toEqual([ct12, hh1]);
    expect(rows).toHaveLength(2);
  });

  it("lets a Kim Văn manager see only CT12", () => {
    const ids = locationsInScope([grant({ scopeType: "ZONE", scopeId: kimVan })], locations, {
      scopeType: "ZONE",
      scopeId: kimVan,
    })?.map((location) => location.id);
    expect(ids).toEqual([ct12]);
  });

  it("lets a CT12 staff member see only that location", () => {
    const ids = locationsInScope(
      [grant({ scopeType: "LOCATION", scopeId: ct12, role: "STAFF" })],
      locations,
      { scopeType: "LOCATION", scopeId: ct12 },
    )?.map((location) => location.id);
    expect(ids).toEqual([ct12]);
    expect(showChainConsole(ids ?? [])).toBe(false);
  });

  it("limits the selector to scopes the user holds", () => {
    const choices = scopeChoices({
      grants: [grant({ scopeType: "ZONE", scopeId: kimVan })],
      locations,
      labels,
    });
    expect(choices.map((choice) => choice.label)).toEqual(["Kim Văn – Kim Lũ", "CT12"]);
    expect(choices.some((choice) => choice.scopeId === linhDam || choice.scopeId === eco)).toBe(false);
  });

  it("keeps an order in the zone recorded on the order", () => {
    const hanoiIds = [ct12, hh1];
    expect(
      orderMatchesScope({
        scopeType: "ZONE",
        scopeId: kimVan,
        orderLocationId: ct12,
        orderZoneId: kimVan,
        orderZoneCityId: hanoi,
        locationIds: [ct12],
      }),
    ).toBe(true);
    expect(
      orderMatchesScope({
        scopeType: "ZONE",
        scopeId: kimVan,
        orderLocationId: ct12,
        orderZoneId: daiKim,
        orderZoneCityId: hanoi,
        locationIds: [ct12],
      }),
    ).toBe(false);
    expect(
      orderMatchesScope({
        scopeType: "CITY",
        scopeId: hanoi,
        orderLocationId: ct12,
        orderZoneId: daiKim,
        orderZoneCityId: hanoi,
        locationIds: hanoiIds,
      }),
    ).toBe(true);
    expect(
      orderMatchesScope({
        scopeType: "CITY",
        scopeId: hanoi,
        orderLocationId: eco,
        orderZoneId: ecoZone,
        orderZoneCityId: south,
        locationIds: hanoiIds,
      }),
    ).toBe(false);
  });

  it("refuses a catalog edit and a grant outside the actor scope", () => {
    const hq = grant({ scopeType: "PROVIDER", scopeId: provider, role: "OWNER" });
    const city = grant({ scopeType: "CITY", scopeId: hanoi });
    expect(canEditSharedCatalog([hq], provider)).toBe(true);
    expect(canEditSharedCatalog([city], provider)).toBe(false);
    expect(
      canGrantMember({
        actor: city,
        role: "STAFF",
        scopeType: "LOCATION",
        scopeId: ct12,
        locations,
      }),
    ).toBe(true);
    expect(
      canGrantMember({
        actor: city,
        role: "STAFF",
        scopeType: "LOCATION",
        scopeId: eco,
        locations,
      }),
    ).toBe(false);
    expect(
      canGrantMember({
        actor: city,
        role: "OWNER",
        scopeType: "LOCATION",
        scopeId: ct12,
        locations,
      }),
    ).toBe(false);
  });

  it("keeps HQ scope across every console route after reload", () => {
    const grants = [grant({ scopeType: "PROVIDER", scopeId: provider, role: "OWNER" })];
    const choices = scopeChoices({ grants, locations, labels });
    const ladder = [
      choices.find((choice) => choice.scopeType === "PROVIDER" && choice.scopeId === provider),
      choices.find((choice) => choice.scopeType === "CITY" && choice.scopeId === hanoi),
      choices.find((choice) => choice.scopeType === "ZONE" && choice.scopeId === kimVan),
      choices.find((choice) => choice.scopeType === "LOCATION" && choice.scopeId === ct12),
    ];
    expect(ladder.every(Boolean)).toBe(true);
    const routes = [
      ...CHAIN_CONSOLE_ROUTES,
      `/provider/organization/locations/${ct12}`,
      "/provider/organization/products/sua-tuoi-180ml",
    ];
    let remembered: (typeof choices)[number] | null = null;
    const widest = choices[0] ?? null;

    for (const scope of ladder) {
      if (!scope) continue;
      for (const route of routes) {
        const href = chainConsoleHref(route, scope, "range=today");
        const reloaded = parseChainScopeQuery(href);
        const sticky = resolveStickyChainScope({
          url: reloaded,
          remembered,
          choices,
          fallback: widest,
        });
        expect(sticky).toMatchObject({ scopeType: scope.scopeType, scopeId: scope.scopeId });
        expect(chainScopeIsWider(sticky ?? scope, scope)).toBe(false);
        const ids = locationsInScope(grants, locations, scope)?.map((location) => location.id) ?? [];
        const wideIds = locationsInScope(grants, locations, { scopeType: "PROVIDER", scopeId: provider })?.map((location) => location.id) ?? [];
        if (scope.scopeType !== "PROVIDER") expect(ids.length).toBeLessThan(wideIds.length);
        expect(parseChainScopeQuery(href)).toEqual(reloaded);
      }
      remembered = scope;
    }

    const restored = resolveStickyChainScope({
      url: null,
      remembered,
      choices,
      fallback: widest,
    });
    expect(restored).toMatchObject({ scopeType: "LOCATION", scopeId: ct12 });
    expect(chainScopeIsWider(restored ?? { scopeType: "LOCATION", scopeId: ct12 }, { scopeType: "LOCATION", scopeId: ct12 })).toBe(false);
  });
});
