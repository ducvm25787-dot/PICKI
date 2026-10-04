import { describe, expect, it } from "vitest";
import type { ChainGrant, ChainLocation } from "./chain-scope.js";
import {
  campaignAttributionRows,
  campaignDisplayStatus,
  campaignReachesHome,
  canCreateChainCampaign,
  canTargetCampaign,
  materialEditReturnsToDraft,
  mergeHomeCandidates,
  offeringSellsAtLocation,
  resolveCampaignLocations,
} from "./campaign-rules.js";

const provider = "p-chain";
const other = "p-other";
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
  { id: otherLoc, providerId: other, zones: [{ id: kimVan, cityId: hanoi }] },
];

function grant(partial: Partial<ChainGrant> & Pick<ChainGrant, "scopeType" | "scopeId" | "role">): ChainGrant {
  return { providerId: provider, ...partial };
}

const now = new Date("2026-10-04T12:00:00+07:00");
const window = {
  startsAt: new Date("2026-10-01T00:00:00+07:00"),
  endsAt: new Date("2026-10-08T00:00:00+07:00"),
};

describe("chain campaign rules", () => {
  const hq = grant({ role: "OWNER", scopeType: "PROVIDER", scopeId: provider });
  const city = grant({ role: "MANAGER", scopeType: "CITY", scopeId: hanoi });
  const zone = grant({ role: "MANAGER", scopeType: "ZONE", scopeId: kimVan });
  const staff = grant({ role: "STAFF", scopeType: "LOCATION", scopeId: ct12 });

  it("lets HQ, Hanoi, and Kim Văn create targets inside their scope", () => {
    expect(canCreateChainCampaign({ grants: [hq], providerLocationCount: 3 })).toBe(true);
    expect(canCreateChainCampaign({ grants: [city], providerLocationCount: 3 })).toBe(true);
    expect(canCreateChainCampaign({ grants: [zone], providerLocationCount: 3 })).toBe(true);
    expect(canCreateChainCampaign({ grants: [staff], providerLocationCount: 3 })).toBe(false);
    expect(canCreateChainCampaign({ grants: [hq], providerLocationCount: 1 })).toBe(false);
    expect(
      canTargetCampaign({ grants: [hq], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "PROVIDER", targetId: provider } }),
    ).toBe(true);
    expect(
      canTargetCampaign({ grants: [city], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "CITY", targetId: hanoi } }),
    ).toBe(true);
    expect(
      canTargetCampaign({ grants: [city], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "CITY", targetId: south } }),
    ).toBe(false);
    expect(
      canTargetCampaign({ grants: [zone], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "ZONE", targetId: kimVan } }),
    ).toBe(true);
    expect(
      canTargetCampaign({ grants: [zone], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "ZONE", targetId: linhDam } }),
    ).toBe(false);
    expect(
      canTargetCampaign({ grants: [staff], providerId: provider, providerLocationCount: 3, locations, target: { targetType: "LOCATION", targetId: ct12 } }),
    ).toBe(false);
  });

  it("resolves only this provider and counts a multi-zone location once", () => {
    const providerWide = resolveCampaignLocations(provider, [{ targetType: "PROVIDER", targetId: provider }], locations);
    expect(providerWide.map((location) => location.id)).toEqual([ct12, hh1, eco]);
    const hanoiRows = resolveCampaignLocations(provider, [{ targetType: "CITY", targetId: hanoi }], locations);
    expect(hanoiRows.map((location) => location.id)).toEqual([ct12, hh1]);
    const kimVanRows = resolveCampaignLocations(provider, [{ targetType: "ZONE", targetId: kimVan }], locations);
    expect(kimVanRows.map((location) => location.id)).toEqual([ct12]);
    expect(resolveCampaignLocations(other, [{ targetType: "ZONE", targetId: kimVan }], locations).map((location) => location.id)).toEqual([otherLoc]);
  });

  it("keeps a submitted campaign off the home until it is active", () => {
    expect(campaignDisplayStatus({ status: "SUBMITTED", ...window, now })).toBe("SUBMITTED");
    expect(campaignDisplayStatus({ status: "APPROVED", ...window, now })).toBe("ACTIVE");
    expect(campaignDisplayStatus({ status: "APPROVED", ...window, now: new Date("2026-10-09T00:00:00+07:00") })).toBe("ENDED");
    const base = {
      status: "APPROVED" as const,
      approvalStatus: "APPROVED",
      contentRevision: 1,
      approvedRevision: 1,
      ...window,
      now,
      locationResolved: true,
      suppression: [],
      zoneId: kimVan,
      locationId: ct12,
      selling: true,
    };
    expect(campaignReachesHome(base)).toBe(true);
    expect(campaignReachesHome({ ...base, status: "SUBMITTED", approvalStatus: "PENDING" })).toBe(false);
    expect(campaignReachesHome({ ...base, selling: false })).toBe(false);
    expect(offeringSellsAtLocation({ status: "AVAILABLE", availableQty: 0, reservedQty: 0, soldQty: 0 })).toBe(false);
    expect(offeringSellsAtLocation({ status: "AVAILABLE", availableQty: 18, reservedQty: 0, soldQty: 0 })).toBe(true);
  });

  it("suppresses one zone without hiding the other, and an edit drops approval", () => {
    const base = {
      status: "APPROVED" as const,
      approvalStatus: "APPROVED",
      contentRevision: 1,
      approvedRevision: 1,
      ...window,
      now,
      locationResolved: true,
      suppression: [{ zoneId: kimVan, locationId: null, expiresAt: null }],
      selling: true,
    };
    expect(campaignReachesHome({ ...base, zoneId: kimVan, locationId: ct12 })).toBe(false);
    expect(campaignReachesHome({ ...base, zoneId: linhDam, locationId: hh1 })).toBe(true);
    expect(campaignReachesHome({ ...base, suppression: [], zoneId: kimVan, locationId: ct12 })).toBe(true);
    expect(materialEditReturnsToDraft("APPROVED")).toBe(true);
    expect(materialEditReturnsToDraft("DRAFT")).toBe(false);
    expect(campaignReachesHome({ ...base, contentRevision: 2, zoneId: linhDam, locationId: hh1 })).toBe(false);
  });

  it("places a chain campaign after a local card and keeps two attributions on one order", () => {
    const merged = mergeHomeCandidates(
      [{ location_id: "local-shop", source: "LOCAL" }],
      [{ location_id: "chain-shop", source: "CAMPAIGN" }],
    );
    expect(merged.map((row) => row.source)).toEqual(["LOCAL", "CAMPAIGN"]);
    const rows = campaignAttributionRows({
      orderId: "order-1",
      locationId: hh1,
      campaigns: [
        { campaignId: "c1", offeringId: "milk", kind: "PRICE_PROMOTION", campaignPrice: null, discountAmount: null, discountPercent: 10 },
        { campaignId: "c2", offeringId: "milk", kind: "DELIVERY_SUBSIDY", campaignPrice: null, discountAmount: 5000, discountPercent: null },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.campaignId)).size).toBe(2);
  });
});
