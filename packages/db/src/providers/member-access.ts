import { and, eq } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { providerLocations, providerZoneMemberships } from "../schema/providers.js";
import { providerMembers } from "../schema/provider-ops.js";
import { zones } from "../schema/zones.js";

export type ProviderScopeType = "PROVIDER" | "CITY" | "ZONE" | "LOCATION";

type LocationScope = {
  providerId: string;
  zoneIds: string[];
  cityIds: string[];
};

export function memberCoversLocation(input: {
  providerId: string;
  scopeType: string;
  scopeId: string;
  locationId: string;
  locationProviderId: string;
  zoneIds: readonly string[];
  cityIds: readonly string[];
}): boolean {
  if (input.providerId !== input.locationProviderId) return false;
  if (input.scopeType === "PROVIDER") return input.scopeId === input.providerId;
  if (input.scopeType === "LOCATION") return input.scopeId === input.locationId;
  if (input.scopeType === "ZONE") return input.zoneIds.includes(input.scopeId);
  if (input.scopeType === "CITY") return input.cityIds.includes(input.scopeId);
  return false;
}

async function locationScope(db: PickiDb, locationId: string): Promise<LocationScope | null> {
  const [location] = await db
    .select({ providerId: providerLocations.providerId })
    .from(providerLocations)
    .where(eq(providerLocations.id, locationId))
    .limit(1);
  if (!location) return null;
  const memberships = await db
    .select({ zoneId: providerZoneMemberships.zoneId, cityId: zones.cityId })
    .from(providerZoneMemberships)
    .innerJoin(zones, eq(zones.id, providerZoneMemberships.zoneId))
    .where(
      and(
        eq(providerZoneMemberships.providerLocationId, locationId),
        eq(providerZoneMemberships.status, "ACTIVE"),
      ),
    );
  return {
    providerId: location.providerId,
    zoneIds: memberships.map((row) => row.zoneId),
    cityIds: [...new Set(memberships.map((row) => row.cityId))],
  };
}

export async function userCoversLocation(db: PickiDb, userId: string, locationId: string): Promise<boolean> {
  const scope = await locationScope(db, locationId);
  if (!scope) return false;
  const members = await db
    .select()
    .from(providerMembers)
    .where(and(eq(providerMembers.userId, userId), eq(providerMembers.providerId, scope.providerId)));
  return members.some((member) =>
    memberCoversLocation({
      providerId: member.providerId,
      scopeType: member.scopeType,
      scopeId: member.scopeId,
      locationId,
      locationProviderId: scope.providerId,
      zoneIds: scope.zoneIds,
      cityIds: scope.cityIds,
    }),
  );
}

export async function membersCoveringLocation(
  db: PickiDb,
  locationId: string,
): Promise<Array<{ userId: string; role: string }>> {
  const scope = await locationScope(db, locationId);
  if (!scope) return [];
  const members = await db
    .select()
    .from(providerMembers)
    .where(eq(providerMembers.providerId, scope.providerId));
  const covered = new Map<string, string>();
  for (const member of members) {
    if (
      !memberCoversLocation({
        providerId: member.providerId,
        scopeType: member.scopeType,
        scopeId: member.scopeId,
        locationId,
        locationProviderId: scope.providerId,
        zoneIds: scope.zoneIds,
        cityIds: scope.cityIds,
      })
    ) {
      continue;
    }
    if (!covered.has(member.userId)) covered.set(member.userId, member.role);
  }
  return [...covered.entries()].map(([userId, role]) => ({ userId, role }));
}

export async function memberUserIdsForLocation(db: PickiDb, locationId: string): Promise<string[]> {
  const members = await membersCoveringLocation(db, locationId);
  return members.map((member) => member.userId);
}

export async function locationsCoveredByUser(
  db: PickiDb,
  userId: string,
): Promise<Array<{ locationId: string; providerId: string; role: string }>> {
  const members = await db.select().from(providerMembers).where(eq(providerMembers.userId, userId));
  const seen = new Set<string>();
  const covered: Array<{ locationId: string; providerId: string; role: string }> = [];
  for (const member of members) {
    const locations = await db
      .select({ id: providerLocations.id, providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.providerId, member.providerId));
    for (const location of locations) {
      if (seen.has(location.id)) continue;
      const scope = await locationScope(db, location.id);
      if (!scope) continue;
      if (
        !memberCoversLocation({
          providerId: member.providerId,
          scopeType: member.scopeType,
          scopeId: member.scopeId,
          locationId: location.id,
          locationProviderId: scope.providerId,
          zoneIds: scope.zoneIds,
          cityIds: scope.cityIds,
        })
      ) {
        continue;
      }
      seen.add(location.id);
      covered.push({ locationId: location.id, providerId: location.providerId, role: member.role });
    }
  }
  return covered;
}
