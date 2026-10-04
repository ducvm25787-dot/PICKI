import { memberCoversLocation } from "./member-access.js";

export type ChainScopeType = "PROVIDER" | "CITY" | "ZONE" | "LOCATION";

export type ChainZone = {
  id: string;
  cityId: string;
};

export type ChainLocation = {
  id: string;
  providerId: string;
  zones: readonly ChainZone[];
};

export type ChainGrant = {
  providerId: string;
  role: string;
  scopeType: string;
  scopeId: string;
};

export type ScopeChoice = {
  scopeType: ChainScopeType;
  scopeId: string;
  label: string;
};

const SCOPE_RANK: Record<ChainScopeType, number> = {
  PROVIDER: 0,
  CITY: 1,
  ZONE: 2,
  LOCATION: 3,
};

export function showChainConsole(locationIds: readonly string[]): boolean {
  return new Set(locationIds).size > 1;
}

export function distinctLocationIds(locations: readonly { id: string }[]): string[] {
  return [...new Set(locations.map((location) => location.id))];
}

export function locationCityId(location: ChainLocation): string | null {
  const cities = [...new Set(location.zones.map((zone) => zone.cityId))];
  return cities.length === 1 ? cities[0]! : null;
}

function covers(
  grant: ChainGrant,
  location: ChainLocation,
): boolean {
  return memberCoversLocation({
    providerId: grant.providerId,
    scopeType: grant.scopeType,
    scopeId: grant.scopeId,
    locationId: location.id,
    locationProviderId: location.providerId,
    zoneIds: location.zones.map((zone) => zone.id),
    cityIds: [...new Set(location.zones.map((zone) => zone.cityId))],
  });
}

export function locationsCoveredByGrants(
  grants: readonly ChainGrant[],
  locations: readonly ChainLocation[],
): ChainLocation[] {
  const seen = new Set<string>();
  const covered: ChainLocation[] = [];
  for (const location of locations) {
    if (seen.has(location.id)) continue;
    if (!grants.some((grant) => covers(grant, location))) continue;
    seen.add(location.id);
    covered.push(location);
  }
  return covered;
}

export function scopeChoices(input: {
  grants: readonly ChainGrant[];
  locations: readonly ChainLocation[];
  labels: {
    providers: Readonly<Record<string, string>>;
    cities: Readonly<Record<string, string>>;
    zones: Readonly<Record<string, string>>;
    locations: Readonly<Record<string, string>>;
  };
}): ScopeChoice[] {
  const covered = locationsCoveredByGrants(input.grants, input.locations);
  const choices = new Map<string, ScopeChoice>();
  const add = (choice: ScopeChoice) => {
    choices.set(`${choice.scopeType}:${choice.scopeId}`, choice);
  };

  for (const grant of input.grants) {
    const mine = covered.filter((location) => covers(grant, location));
    if (grant.scopeType === "PROVIDER") {
      add({
        scopeType: "PROVIDER",
        scopeId: grant.providerId,
        label: `Toàn ${input.labels.providers[grant.providerId] ?? "hệ thống"}`,
      });
    }
    if (grant.scopeType === "CITY") {
      const label = input.labels.cities[grant.scopeId];
      if (label && mine.some((location) => locationCityId(location) === grant.scopeId)) {
        add({ scopeType: "CITY", scopeId: grant.scopeId, label });
      }
    }
    if (grant.scopeType === "ZONE") {
      const label = input.labels.zones[grant.scopeId];
      if (label && mine.some((location) => location.zones.some((zone) => zone.id === grant.scopeId))) {
        add({ scopeType: "ZONE", scopeId: grant.scopeId, label });
      }
    }
    if (grant.scopeType === "LOCATION") {
      const label = input.labels.locations[grant.scopeId];
      if (label && mine.some((location) => location.id === grant.scopeId)) {
        add({ scopeType: "LOCATION", scopeId: grant.scopeId, label });
      }
    }

    if (grant.scopeType === "PROVIDER" || grant.scopeType === "CITY" || grant.scopeType === "ZONE") {
      for (const location of mine) {
        const cityId = locationCityId(location);
        if (
          cityId &&
          input.labels.cities[cityId] &&
          (grant.scopeType === "PROVIDER" || (grant.scopeType === "CITY" && grant.scopeId === cityId))
        ) {
          const cityLabel = input.labels.cities[cityId];
          if (cityLabel) add({ scopeType: "CITY", scopeId: cityId, label: cityLabel });
        }
        for (const zone of location.zones) {
          const zoneAllowed =
            grant.scopeType === "PROVIDER" ||
            (grant.scopeType === "CITY" && zone.cityId === grant.scopeId) ||
            (grant.scopeType === "ZONE" && zone.id === grant.scopeId);
          const zoneLabel = input.labels.zones[zone.id];
          if (!zoneAllowed || !zoneLabel) continue;
          add({ scopeType: "ZONE", scopeId: zone.id, label: zoneLabel });
        }
        const locationLabel = input.labels.locations[location.id];
        if (locationLabel) {
          add({
            scopeType: "LOCATION",
            scopeId: location.id,
            label: locationLabel,
          });
        }
      }
    }
  }

  return [...choices.values()].sort((a, b) => {
    const rank = SCOPE_RANK[a.scopeType] - SCOPE_RANK[b.scopeType];
    if (rank !== 0) return rank;
    return a.label.localeCompare(b.label, "vi");
  });
}

export function locationsInScope(
  grants: readonly ChainGrant[],
  locations: readonly ChainLocation[],
  scope: { scopeType: ChainScopeType; scopeId: string },
): ChainLocation[] | null {
  const choices = scopeChoices({
    grants,
    locations,
    labels: {
      providers: Object.fromEntries(grants.map((grant) => [grant.providerId, grant.providerId])),
      cities: Object.fromEntries(
        locations.flatMap((location) => location.zones.map((zone) => [zone.cityId, zone.cityId])),
      ),
      zones: Object.fromEntries(
        locations.flatMap((location) => location.zones.map((zone) => [zone.id, zone.id])),
      ),
      locations: Object.fromEntries(locations.map((location) => [location.id, location.id])),
    },
  });
  if (!choices.some((choice) => choice.scopeType === scope.scopeType && choice.scopeId === scope.scopeId)) {
    return null;
  }
  const covered = locationsCoveredByGrants(grants, locations);
  const matched = covered.filter((location) => {
    if (scope.scopeType === "PROVIDER") return location.providerId === scope.scopeId;
    if (scope.scopeType === "CITY") return locationCityId(location) === scope.scopeId;
    if (scope.scopeType === "ZONE") return location.zones.some((zone) => zone.id === scope.scopeId);
    return location.id === scope.scopeId;
  });
  const seen = new Set<string>();
  return matched.filter((location) => {
    if (seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

export function orderMatchesScope(input: {
  scopeType: ChainScopeType;
  scopeId: string;
  orderLocationId: string;
  orderZoneId: string;
  orderZoneCityId: string;
  locationIds: readonly string[];
}): boolean {
  if (!input.locationIds.includes(input.orderLocationId)) return false;
  if (input.scopeType === "ZONE") return input.orderZoneId === input.scopeId;
  if (input.scopeType === "CITY") return input.orderZoneCityId === input.scopeId;
  if (input.scopeType === "LOCATION") return input.orderLocationId === input.scopeId;
  return true;
}

export function canManageChainMembers(grants: readonly ChainGrant[]): boolean {
  return grants.some((grant) => grant.role === "OWNER" || grant.role === "MANAGER");
}

export function canEditSharedCatalog(grants: readonly ChainGrant[], providerId: string): boolean {
  return grants.some(
    (grant) =>
      grant.providerId === providerId &&
      grant.scopeType === "PROVIDER" &&
      (grant.role === "OWNER" || grant.role === "MANAGER"),
  );
}

/** A manager can only grant a scope they already hold, and cannot appoint an owner. */
export function canGrantMember(input: {
  actor: ChainGrant;
  role: string;
  scopeType: ChainScopeType;
  scopeId: string;
  locations: readonly ChainLocation[];
}): boolean {
  if (input.actor.role !== "OWNER" && input.actor.role !== "MANAGER") return false;
  if (input.actor.role === "MANAGER" && input.role === "OWNER") return false;
  if (!["OWNER", "MANAGER", "STAFF"].includes(input.role)) return false;
  if (input.scopeType === "PROVIDER" && input.actor.scopeType !== "PROVIDER") return false;
  if (input.scopeType === "PROVIDER" && input.scopeId !== input.actor.providerId) return false;
  const targetLocations = locationsInScope([input.actor], input.locations, {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
  });
  return targetLocations != null && targetLocations.length > 0;
}
