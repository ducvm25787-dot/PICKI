export type AdminRoleRow = {
  role: string;
  scopeType: string | null;
  scopeId: string | null;
};

/**
 * Every admin API belongs to one ownership scope.
 * GLOBAL — system config: zone boundaries, service areas, draft beer, the system-wide audit log.
 * CITY — content shared by a city: home banners and experiences. Scope id is experience_cities.id.
 * ZONE — local operations: settings, orders, providers, runners, moderation.
 * Finance follows GLOBAL, CITY, or ZONE from the role row. It does not grant content or system writes.
 */
export type OwnershipScope = "GLOBAL" | "CITY" | "ZONE";

export type CityGrant = "admin" | "support";
export type ZoneGrant = "admin" | "operator" | "support";

export type AdminAccess = {
  superAdmin: boolean;
  supportReadOnlyGlobal: boolean;
  financeGlobal: boolean;
  cities: Record<string, CityGrant>;
  financeCities: Record<string, true>;
  zones: Record<string, ZoneGrant>;
  financeZones: Record<string, true>;
};

const ZONE_RANK: Record<ZoneGrant, number> = { support: 1, operator: 2, admin: 3 };
const CITY_RANK: Record<CityGrant, number> = { support: 1, admin: 2 };

function raiseZone(zones: Record<string, ZoneGrant>, zoneId: string, grant: ZoneGrant) {
  const current = zones[zoneId];
  if (!current || ZONE_RANK[grant] > ZONE_RANK[current]) zones[zoneId] = grant;
}

function raiseCity(cities: Record<string, CityGrant>, cityId: string, grant: CityGrant) {
  const current = cities[cityId];
  if (!current || CITY_RANK[grant] > CITY_RANK[current]) cities[cityId] = grant;
}

function scoped(row: AdminRoleRow, scopeType: OwnershipScope): string | null {
  return row.scopeType === scopeType && row.scopeId ? row.scopeId : null;
}

/** Every matching role is applied. A role without the scope it requires is ignored. */
export function resolveAdminAccess(rows: readonly AdminRoleRow[]): AdminAccess | null {
  const zones: Record<string, ZoneGrant> = {};
  const cities: Record<string, CityGrant> = {};
  const financeCities: Record<string, true> = {};
  const financeZones: Record<string, true> = {};
  let superAdmin = false;
  let supportReadOnlyGlobal = false;
  let financeGlobal = false;
  let recognized = false;

  for (const row of rows) {
    const zoneId = scoped(row, "ZONE");
    const cityId = scoped(row, "CITY");
    if (row.role === "SUPER_ADMIN") {
      if (zoneId) {
        recognized = true;
        raiseZone(zones, zoneId, "admin");
      } else if (cityId) {
        recognized = true;
        raiseCity(cities, cityId, "admin");
      } else if (row.scopeType == null && row.scopeId == null) {
        recognized = true;
        superAdmin = true;
      }
    } else if (row.role === "CITY_ADMIN" && cityId) {
      recognized = true;
      raiseCity(cities, cityId, "admin");
    } else if (row.role === "ZONE_ADMIN" && zoneId) {
      recognized = true;
      raiseZone(zones, zoneId, "admin");
    } else if (row.role === "ZONE_OPERATOR" && zoneId) {
      recognized = true;
      raiseZone(zones, zoneId, "operator");
    } else if (row.role === "SUPPORT") {
      if (zoneId) {
        recognized = true;
        raiseZone(zones, zoneId, "support");
      } else if (cityId) {
        recognized = true;
        raiseCity(cities, cityId, "support");
      } else if (row.scopeType == null && row.scopeId == null) {
        recognized = true;
        supportReadOnlyGlobal = true;
      }
    } else if (row.role === "FINANCE") {
      if (zoneId) {
        recognized = true;
        financeZones[zoneId] = true;
      } else if (cityId) {
        recognized = true;
        financeCities[cityId] = true;
      } else if (row.scopeType == null && row.scopeId == null) {
        recognized = true;
        financeGlobal = true;
      }
    }
  }

  if (!recognized) return null;
  return {
    superAdmin,
    supportReadOnlyGlobal,
    financeGlobal,
    cities,
    financeCities,
    zones,
    financeZones,
  };
}

export function canReadGlobal(access: AdminAccess): boolean {
  return access.superAdmin || access.supportReadOnlyGlobal;
}

export function canWriteGlobal(access: AdminAccess): boolean {
  return access.superAdmin;
}

export function canReadCity(access: AdminAccess, cityId: string): boolean {
  return access.superAdmin || access.supportReadOnlyGlobal || access.cities[cityId] != null;
}

export function canWriteCity(access: AdminAccess, cityId: string): boolean {
  return access.superAdmin || access.cities[cityId] === "admin";
}

export function canReadAnyCity(access: AdminAccess): boolean {
  return access.superAdmin || access.supportReadOnlyGlobal || Object.keys(access.cities).length > 0;
}

export function canWriteAnyCity(access: AdminAccess): boolean {
  return access.superAdmin || Object.values(access.cities).some((grant) => grant === "admin");
}

export function canReadZone(access: AdminAccess, zoneId: string): boolean {
  return access.superAdmin || access.zones[zoneId] != null;
}

export function canOperateZone(access: AdminAccess, zoneId: string): boolean {
  if (access.superAdmin) return true;
  const grant = access.zones[zoneId];
  return grant === "admin" || grant === "operator";
}

export function canConfigureZone(access: AdminAccess, zoneId: string): boolean {
  return access.superAdmin || access.zones[zoneId] === "admin";
}

export function canReadFinance(
  access: AdminAccess,
  target: { scope: "GLOBAL" } | { scope: "CITY"; id: string } | { scope: "ZONE"; id: string },
): boolean {
  if (access.superAdmin || access.financeGlobal || access.supportReadOnlyGlobal) return true;
  if (target.scope === "GLOBAL") return false;
  if (target.scope === "CITY") {
    return access.financeCities[target.id] === true || access.cities[target.id] === "support";
  }
  return access.financeZones[target.id] === true || access.zones[target.id] === "support";
}

/** Location pause and verification change the location for every Zone it serves. */
export function canOperateLocation(
  access: AdminAccess,
  membershipZoneIds: readonly string[],
  actingZoneId: string,
): boolean {
  if (!membershipZoneIds.includes(actingZoneId)) return false;
  if (access.superAdmin) return true;
  if (!canOperateZone(access, actingZoneId)) return false;
  return membershipZoneIds.every((zoneId) => canOperateZone(access, zoneId));
}
