import type { ChainGrant, ChainLocation, ChainScopeType } from "./chain-scope.js";

export const campaignTypes = [
  "HERO_PRODUCT",
  "TODAY_FEATURE",
  "PRICE_PROMOTION",
  "DELIVERY_SUBSIDY",
  "CONTENT_CAMPAIGN",
] as const;

export type CampaignType = (typeof campaignTypes)[number];

export type CampaignStoredStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "PAUSED" | "REJECTED";
export type CampaignDisplayStatus = CampaignStoredStatus | "ACTIVE" | "ENDED";

export type CampaignTarget = {
  targetType: ChainScopeType;
  targetId: string;
};

export type CampaignSuppression = {
  zoneId: string;
  locationId: string | null;
  expiresAt: Date | null;
};

const MANAGER_ROLES = new Set(["OWNER", "MANAGER"]);

export function canCreateChainCampaign(input: {
  grants: readonly ChainGrant[];
  providerLocationCount: number;
}): boolean {
  if (input.providerLocationCount < 2) return false;
  return input.grants.some(
    (grant) =>
      MANAGER_ROLES.has(grant.role) &&
      (grant.scopeType === "PROVIDER" || grant.scopeType === "CITY" || grant.scopeType === "ZONE"),
  );
}

export function canTargetCampaign(input: {
  grants: readonly ChainGrant[];
  providerId: string;
  providerLocationCount: number;
  target: CampaignTarget;
  locations: readonly ChainLocation[];
}): boolean {
  if (!canCreateChainCampaign(input)) return false;
  const mine = input.locations.filter((location) => location.providerId === input.providerId);
  if (input.target.targetType === "PROVIDER" && input.target.targetId !== input.providerId) return false;
  const targetLocations = resolveCampaignLocations(input.providerId, [input.target], mine);
  if (targetLocations.length === 0) return false;
  return input.grants.some((grant) => {
    if (grant.providerId !== input.providerId || !MANAGER_ROLES.has(grant.role)) return false;
    if (grant.scopeType === "LOCATION") return false;
    if (grant.scopeType === "PROVIDER") return grant.scopeId === input.providerId;
    if (grant.scopeType === "CITY") {
      return targetLocations.every((location) => location.zones.some((zone) => zone.cityId === grant.scopeId));
    }
    if (grant.scopeType === "ZONE") {
      if (input.target.targetType === "PROVIDER" || input.target.targetType === "CITY") return false;
      return targetLocations.every((location) => location.zones.some((zone) => zone.id === grant.scopeId));
    }
    return false;
  });
}

/** Dynamic membership. A location in two zones of one city is counted once. */
export function resolveCampaignLocations(
  providerId: string,
  targets: readonly CampaignTarget[],
  locations: readonly ChainLocation[],
): ChainLocation[] {
  const seen = new Set<string>();
  const resolved: ChainLocation[] = [];
  for (const location of locations) {
    if (location.providerId !== providerId || seen.has(location.id)) continue;
    const hit = targets.some((target) => locationMatchesTarget(location, providerId, target));
    if (!hit) continue;
    seen.add(location.id);
    resolved.push(location);
  }
  return resolved;
}

function locationMatchesTarget(location: ChainLocation, providerId: string, target: CampaignTarget): boolean {
  if (target.targetType === "PROVIDER") return target.targetId === providerId;
  if (target.targetType === "CITY") return location.zones.some((zone) => zone.cityId === target.targetId);
  if (target.targetType === "ZONE") return location.zones.some((zone) => zone.id === target.targetId);
  return location.id === target.targetId;
}

export function campaignDisplayStatus(input: {
  status: CampaignStoredStatus;
  startsAt: Date;
  endsAt: Date;
  now: Date;
}): CampaignDisplayStatus {
  if (input.now >= input.endsAt && (input.status === "APPROVED" || input.status === "PAUSED")) return "ENDED";
  if (input.status !== "APPROVED") return input.status;
  if (input.now < input.startsAt) return "APPROVED";
  return "ACTIVE";
}

export function offeringSellsAtLocation(
  row: { status: string; availableQty: number | null; reservedQty: number; soldQty: number } | null,
): boolean {
  if (!row || row.status !== "AVAILABLE") return false;
  if (row.availableQty == null) return true;
  return row.availableQty - row.reservedQty - row.soldQty > 0;
}

export function campaignReachesHome(input: {
  status: CampaignStoredStatus;
  approvalStatus: string;
  contentRevision: number;
  approvedRevision: number | null;
  startsAt: Date;
  endsAt: Date;
  now: Date;
  locationResolved: boolean;
  suppression: readonly CampaignSuppression[];
  zoneId: string;
  locationId: string;
  selling: boolean;
}): boolean {
  if (campaignDisplayStatus(input) !== "ACTIVE") return false;
  if (input.approvalStatus !== "APPROVED" || input.approvedRevision !== input.contentRevision) return false;
  if (!input.locationResolved || !input.selling) return false;
  return !isSuppressed(input.suppression, input.zoneId, input.locationId, input.now);
}

export function isSuppressed(
  rows: readonly CampaignSuppression[],
  zoneId: string,
  locationId: string,
  now: Date,
): boolean {
  return rows.some((row) => {
    if (row.zoneId !== zoneId) return false;
    if (row.expiresAt && row.expiresAt <= now) return false;
    if (row.locationId == null) return true;
    return row.locationId === locationId;
  });
}

export function materialEditReturnsToDraft(status: CampaignStoredStatus): boolean {
  return status === "SUBMITTED" || status === "APPROVED" || status === "PAUSED" || status === "REJECTED";
}

export function mergeHomeCandidates<T extends { location_id: string }>(local: readonly T[], campaigns: readonly T[]): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  const take = (row: T | undefined) => {
    if (!row || seen.has(row.location_id)) return;
    seen.add(row.location_id);
    merged.push(row);
  };
  const length = Math.max(local.length, campaigns.length);
  for (let index = 0; index < length; index += 1) {
    take(local[index]);
    take(campaigns[index]);
  }
  return merged;
}

export function campaignAttributionRows(input: {
  orderId: string;
  locationId: string;
  campaigns: readonly {
    campaignId: string;
    offeringId: string | null;
    kind: CampaignType;
    campaignPrice: number | null;
    discountAmount: number | null;
    discountPercent: number | null;
  }[];
}) {
  return input.campaigns.map((campaign) => ({
    orderId: input.orderId,
    campaignId: campaign.campaignId,
    providerLocationId: input.locationId,
    offeringId: campaign.offeringId,
    attributionKind: campaign.kind,
    campaignPrice: campaign.campaignPrice,
    discountAmount: campaign.discountAmount,
    discountPercent: campaign.discountPercent,
    snapshot: {
      campaignId: campaign.campaignId,
      offeringId: campaign.offeringId,
      kind: campaign.kind,
      campaignPrice: campaign.campaignPrice,
      discountAmount: campaign.discountAmount,
      discountPercent: campaign.discountPercent,
    },
  }));
}
