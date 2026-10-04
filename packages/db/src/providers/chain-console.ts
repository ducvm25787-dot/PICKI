import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { offerings, offeringPrices, productCategories, productDailyAvailability } from "../schema/catalog.js";
import { experienceCities } from "../schema/experiences.js";
import { providerDailyUpdates, providerDailyUpdateZoneTargets } from "../schema/habit.js";
import { users } from "../schema/identity.js";
import { orders } from "../schema/orders.js";
import { providerMembers } from "../schema/provider-ops.js";
import {
  providerLiveStatus,
  providerLocations,
  providerZoneMemberships,
  providers,
} from "../schema/providers.js";
import { zones } from "../schema/zones.js";
import {
  canEditSharedCatalog,
  canManageChainMembers,
  distinctLocationIds,
  locationCityId,
  locationsCoveredByGrants,
  locationsInScope,
  scopeChoices,
  showChainConsole,
  type ChainGrant,
  type ChainLocation,
  type ChainScopeType,
  type ScopeChoice,
} from "./chain-scope.js";

const PENDING = ["CREATED", "PAID"] as const;
const DELIVERING = ["RUNNER_ASSIGNED", "PICKED_UP", "DELIVERING"] as const;

export type ChainLocationView = ChainLocation & {
  name: string;
  status: string;
  liveStatus: string;
  brandName: string;
  providerType: string;
  commerceModel: string | null;
  cityLabel: string | null;
  zoneNames: { id: string; name: string; cityId: string; cityLabel: string }[];
};

export type ChainViewer = {
  userId: string;
  chainEnabled: boolean;
  canManageMembers: boolean;
  grants: ChainGrant[];
  scopes: ScopeChoice[];
  locations: ChainLocationView[];
};

export type ChainScope = { scopeType: ChainScopeType; scopeId: string };

export function vnDayStart(now = new Date()): Date {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
  return new Date(`${day}T00:00:00+07:00`);
}

export function commerceToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(now);
}

export async function loadChainViewer(db: PickiDb, userId: string): Promise<ChainViewer> {
  const memberRows = await db
    .select()
    .from(providerMembers)
    .where(eq(providerMembers.userId, userId));
  const grants: ChainGrant[] = memberRows.map((row) => ({
    providerId: row.providerId,
    role: row.role,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
  }));
  const providerIds = [...new Set(grants.map((grant) => grant.providerId))];
  if (providerIds.length === 0) {
    return { userId, chainEnabled: false, canManageMembers: false, grants, scopes: [], locations: [] };
  }

  const locationRows = await db
    .select({
      id: providerLocations.id,
      providerId: providerLocations.providerId,
      name: providerLocations.displayName,
      status: providerLocations.status,
      brandName: providers.brandName,
      providerType: providers.providerType,
      commerceModel: providers.commerceModel,
    })
    .from(providerLocations)
    .innerJoin(providers, eq(providers.id, providerLocations.providerId))
    .where(inArray(providerLocations.providerId, providerIds));

  const locationIds = locationRows.map((row) => row.id);
  const membershipRows = locationIds.length
    ? await db
        .select({
          locationId: providerZoneMemberships.providerLocationId,
          zoneId: zones.id,
          zoneName: zones.displayName,
          cityId: zones.cityId,
          cityLabel: experienceCities.label,
        })
        .from(providerZoneMemberships)
        .innerJoin(zones, eq(zones.id, providerZoneMemberships.zoneId))
        .innerJoin(experienceCities, eq(experienceCities.id, zones.cityId))
        .where(
          and(
            inArray(providerZoneMemberships.providerLocationId, locationIds),
            eq(providerZoneMemberships.status, "ACTIVE"),
          ),
        )
    : [];
  const liveRows = locationIds.length
    ? await db
        .select({
          locationId: providerLiveStatus.providerLocationId,
          status: providerLiveStatus.status,
        })
        .from(providerLiveStatus)
        .where(inArray(providerLiveStatus.providerLocationId, locationIds))
    : [];
  const liveByLocation = new Map(liveRows.map((row) => [row.locationId, row.status]));

  const locations: ChainLocationView[] = locationRows
    .filter((row) => row.status === "ACTIVE" || row.status === "PAUSED")
    .map((row) => {
      const zoneNames = membershipRows
        .filter((membership) => membership.locationId === row.id)
        .map((membership) => ({
          id: membership.zoneId,
          name: membership.zoneName,
          cityId: membership.cityId,
          cityLabel: membership.cityLabel,
        }));
      const cityId = locationCityId({ id: row.id, providerId: row.providerId, zones: zoneNames });
      return {
        id: row.id,
        providerId: row.providerId,
        name: row.name,
        status: row.status,
        liveStatus: liveByLocation.get(row.id) ?? "OFFLINE",
        brandName: row.brandName,
        providerType: row.providerType,
        commerceModel: row.commerceModel,
        cityLabel: zoneNames.find((zone) => zone.cityId === cityId)?.cityLabel ?? null,
        zones: zoneNames,
        zoneNames,
      };
    });

  const scopes = scopeChoices({
    grants,
    locations,
    labels: {
      providers: Object.fromEntries(locations.map((location) => [location.providerId, location.brandName])),
      cities: Object.fromEntries(locations.flatMap((location) => location.zoneNames.map((zone) => [zone.cityId, zone.cityLabel]))),
      zones: Object.fromEntries(locations.flatMap((location) => location.zoneNames.map((zone) => [zone.id, zone.name]))),
      locations: Object.fromEntries(locations.map((location) => [location.id, location.name])),
    },
  });
  const coveredIds = distinctLocationIds(locationsCoveredByGrants(grants, locations));
  return {
    userId,
    chainEnabled: showChainConsole(coveredIds),
    canManageMembers: canManageChainMembers(grants),
    grants,
    scopes,
    locations,
  };
}

export function resolveChainScope(viewer: ChainViewer, requested?: Partial<ChainScope>): {
  scope: ScopeChoice;
  locations: ChainLocationView[];
} {
  const scope = requested?.scopeType && requested.scopeId
    ? viewer.scopes.find((choice) => choice.scopeType === requested.scopeType && choice.scopeId === requested.scopeId) ?? null
    : viewer.scopes[0] ?? null;
  if (!scope) return { scope: { scopeType: "PROVIDER", scopeId: "", label: "" }, locations: [] };
  const rows = locationsInScope(viewer.grants, viewer.locations, scope) ?? [];
  const byId = new Map(viewer.locations.map((location) => [location.id, location]));
  return {
    scope,
    locations: rows.flatMap((location) => {
      const view = byId.get(location.id);
      return view ? [view] : [];
    }),
  };
}

function remaining(row: { availableQty: number | null; reservedQty: number; soldQty: number }): number | null {
  if (row.availableQty == null) return null;
  return row.availableQty - row.reservedQty - row.soldQty;
}

function isSelling(row: { status: string; availableQty: number | null; reservedQty: number; soldQty: number }): boolean {
  if (row.status !== "AVAILABLE") return false;
  const left = remaining(row);
  return left == null || left > 0;
}

function isSoldOut(row: { status: string; availableQty: number | null; reservedQty: number; soldQty: number }): boolean {
  if (row.status === "HIDDEN") return false;
  if (row.status === "SOLD_OUT") return true;
  const left = remaining(row);
  return left != null && left <= 0;
}

async function ordersForScope(
  db: PickiDb,
  locations: ChainLocationView[],
  scope: ChainScope,
  since: Date,
) {
  const ids = locations.map((location) => location.id);
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      locationId: orders.providerLocationId,
      zoneId: orders.zoneId,
      cityId: zones.cityId,
      status: orders.status,
      serviceVertical: orders.serviceVertical,
      fulfillmentMode: orders.fulfillmentMode,
      createdAt: orders.createdAt,
      customerName: users.displayName,
    })
    .from(orders)
    .innerJoin(zones, eq(zones.id, orders.zoneId))
    .innerJoin(users, eq(users.id, orders.customerUserId))
    .where(and(inArray(orders.providerLocationId, ids), gte(orders.createdAt, since)))
    .orderBy(desc(orders.createdAt));
  return rows.filter((row) => {
    if (scope.scopeType === "ZONE") return row.zoneId === scope.scopeId;
    if (scope.scopeType === "CITY") return row.cityId === scope.scopeId;
    if (scope.scopeType === "LOCATION") return row.locationId === scope.scopeId;
    return true;
  });
}

export async function chainOverview(
  db: PickiDb,
  locations: ChainLocationView[],
  scope: ChainScope,
  now = new Date(),
) {
  const day = commerceToday(now);
  const ids = distinctLocationIds(locations);
  const orderRows = await ordersForScope(db, locations, scope, vnDayStart(now));
  const stock = ids.length
    ? await db
        .select({
          locationId: productDailyAvailability.providerLocationId,
          offeringId: productDailyAvailability.offeringId,
          status: productDailyAvailability.status,
          availableQty: productDailyAvailability.availableQty,
          reservedQty: productDailyAvailability.reservedQty,
          soldQty: productDailyAvailability.soldQty,
        })
        .from(productDailyAvailability)
        .where(
          and(inArray(productDailyAvailability.providerLocationId, ids), eq(productDailyAvailability.serviceDate, day)),
        )
    : [];
  const selling = stock.filter(isSelling);
  const soldOut = stock.filter(isSoldOut);
  const attention = locations.flatMap((location) => {
    const soldOutCount = soldOut.filter((row) => row.locationId === location.id).length;
    const pendingCount = orderRows.filter(
      (row) => row.locationId === location.id && PENDING.includes(row.status as (typeof PENDING)[number]),
    ).length;
    if (location.status === "PAUSED" || location.liveStatus === "CLOSED") {
      return [{ locationId: location.id, name: location.name, reason: "đang tạm đóng" }];
    }
    if (soldOutCount > 0) {
      return [{ locationId: location.id, name: location.name, reason: `${soldOutCount} món hết hàng` }];
    }
    if (pendingCount > 0) {
      return [{ locationId: location.id, name: location.name, reason: `${pendingCount} đơn chờ nhận` }];
    }
    return [];
  });
  return {
    locationCount: ids.length,
    openCount: locations.filter(
      (location) => location.status === "ACTIVE" && (location.liveStatus === "OPEN" || location.liveStatus === "BUSY"),
    ).length,
    ordersToday: orderRows.length,
    ordersPending: orderRows.filter((row) => PENDING.includes(row.status as (typeof PENDING)[number])).length,
    ordersDelivering: orderRows.filter((row) => DELIVERING.includes(row.status as (typeof DELIVERING)[number])).length,
    sellingCount: selling.length,
    soldOutCount: soldOut.length,
    attention,
  };
}

export async function chainLocationRows(
  db: PickiDb,
  locations: ChainLocationView[],
  scope: ChainScope,
  now = new Date(),
) {
  const overviewOrders = await ordersForScope(db, locations, scope, vnDayStart(now));
  const ids = locations.map((location) => location.id);
  const day = commerceToday(now);
  const stock = ids.length
    ? await db
        .select({
          locationId: productDailyAvailability.providerLocationId,
          status: productDailyAvailability.status,
          availableQty: productDailyAvailability.availableQty,
          reservedQty: productDailyAvailability.reservedQty,
          soldQty: productDailyAvailability.soldQty,
        })
        .from(productDailyAvailability)
        .where(and(inArray(productDailyAvailability.providerLocationId, ids), eq(productDailyAvailability.serviceDate, day)))
    : [];
  return locations.map((location) => {
    const rows = stock.filter((row) => row.locationId === location.id);
    return {
      id: location.id,
      name: location.name,
      city: location.cityLabel,
      zones: location.zoneNames.map((zone) => zone.name),
      status: location.status,
      liveStatus: location.liveStatus,
      ordersToday: overviewOrders.filter((row) => row.locationId === location.id).length,
      sellingCount: rows.filter(isSelling).length,
      soldOutCount: rows.filter(isSoldOut).length,
    };
  });
}

export async function chainOrders(
  db: PickiDb,
  locations: ChainLocationView[],
  scope: ChainScope,
  filter: { range: "today" | "7d"; status?: string; locationId?: string; vertical?: string },
  now = new Date(),
) {
  const since = filter.range === "today" ? vnDayStart(now) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const narrowed = filter.locationId
    ? locations.filter((location) => location.id === filter.locationId)
    : locations;
  const rows = await ordersForScope(db, narrowed, scope, since);
  const names = new Map(locations.map((location) => [location.id, location.name]));
  return rows
    .filter((row) => !filter.status || row.status === filter.status)
    .filter((row) => !filter.vertical || row.serviceVertical === filter.vertical)
    .slice(0, 100)
    .map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      locationId: row.locationId,
      locationName: names.get(row.locationId) ?? "",
      vertical: row.serviceVertical,
      customerName: row.customerName,
      status: row.status,
      fulfillment: row.fulfillmentMode,
      createdAt: row.createdAt.toISOString(),
    }));
}

export async function chainProducts(
  db: PickiDb,
  locations: ChainLocationView[],
  now = new Date(),
) {
  const providerIds = [...new Set(locations.map((location) => location.providerId))];
  const ids = locations.map((location) => location.id);
  if (providerIds.length === 0) return [];
  const rows = await db
    .select({
      id: offerings.id,
      providerId: offerings.providerId,
      name: offerings.name,
      status: offerings.status,
      categoryName: productCategories.name,
      providerType: providers.providerType,
    })
    .from(offerings)
    .innerJoin(providers, eq(providers.id, offerings.providerId))
    .leftJoin(productCategories, eq(productCategories.id, offerings.categoryId))
    .where(and(inArray(offerings.providerId, providerIds), ne(offerings.status, "DELETED")));
  const day = commerceToday(now);
  const stock = ids.length
    ? await db
        .select({
          locationId: productDailyAvailability.providerLocationId,
          offeringId: productDailyAvailability.offeringId,
          status: productDailyAvailability.status,
          availableQty: productDailyAvailability.availableQty,
          reservedQty: productDailyAvailability.reservedQty,
          soldQty: productDailyAvailability.soldQty,
        })
        .from(productDailyAvailability)
        .where(and(inArray(productDailyAvailability.providerLocationId, ids), eq(productDailyAvailability.serviceDate, day)))
    : [];
  return rows.map((row) => {
    const mine = stock.filter((item) => item.offeringId === row.id);
    return {
      id: row.id,
      providerId: row.providerId,
      name: row.name,
      categoryName: row.categoryName,
      vertical: row.providerType,
      status: row.status,
      sellingLocations: mine.filter(isSelling).length,
      soldOutLocations: mine.filter(isSoldOut).length,
    };
  });
}

export async function chainProductLocations(
  db: PickiDb,
  locations: ChainLocationView[],
  offeringId: string,
  now = new Date(),
) {
  const ids = locations.map((location) => location.id);
  const day = commerceToday(now);
  const prices = ids.length
    ? await db
        .select({
          locationId: offeringPrices.providerLocationId,
          amountVnd: offeringPrices.amountVnd,
        })
        .from(offeringPrices)
        .where(and(eq(offeringPrices.offeringId, offeringId), inArray(offeringPrices.providerLocationId, ids)))
    : [];
  const stock = ids.length
    ? await db
        .select()
        .from(productDailyAvailability)
        .where(
          and(
            eq(productDailyAvailability.offeringId, offeringId),
            inArray(productDailyAvailability.providerLocationId, ids),
            eq(productDailyAvailability.serviceDate, day),
          ),
        )
    : [];
  const priceByLocation = new Map(prices.map((row) => [row.locationId, row.amountVnd]));
  const stockByLocation = new Map(stock.map((row) => [row.providerLocationId, row]));
  return locations.map((location) => {
    const dayRow = stockByLocation.get(location.id);
    return {
      locationId: location.id,
      locationName: location.name,
      priceVnd: priceByLocation.get(location.id) ?? null,
      availableQty: dayRow ? remaining(dayRow) : null,
      status: dayRow?.status ?? null,
      selling: dayRow ? isSelling(dayRow) : false,
    };
  });
}

export async function chainToday(
  db: PickiDb,
  locations: ChainLocationView[],
  now = new Date(),
) {
  const ids = locations.map((location) => location.id);
  if (ids.length === 0) return [];
  const day = commerceToday(now);
  const stock = await db
    .select({
      locationId: productDailyAvailability.providerLocationId,
      offeringId: productDailyAvailability.offeringId,
      name: offerings.name,
      status: productDailyAvailability.status,
      availableQty: productDailyAvailability.availableQty,
      reservedQty: productDailyAvailability.reservedQty,
      soldQty: productDailyAvailability.soldQty,
    })
    .from(productDailyAvailability)
    .innerJoin(offerings, eq(offerings.id, productDailyAvailability.offeringId))
    .where(and(inArray(productDailyAvailability.providerLocationId, ids), eq(productDailyAvailability.serviceDate, day)));
  const updates = await db
    .select({
      id: providerDailyUpdates.id,
      locationId: providerDailyUpdates.providerLocationId,
      offeringId: providerDailyUpdates.linkedEntityId,
      title: providerDailyUpdates.title,
      zoneId: providerDailyUpdateZoneTargets.zoneId,
      reviewStatus: providerDailyUpdateZoneTargets.reviewStatus,
    })
    .from(providerDailyUpdates)
    .leftJoin(
      providerDailyUpdateZoneTargets,
      eq(providerDailyUpdateZoneTargets.updateId, providerDailyUpdates.id),
    )
    .where(
      and(
        inArray(providerDailyUpdates.providerLocationId, ids),
        sql`${providerDailyUpdates.expiresAt} > now()`,
        ne(providerDailyUpdates.status, "HIDDEN"),
      ),
    );
  const names = new Map(locations.map((location) => [location.id, location.name]));
  const zoneNames = new Map(locations.flatMap((location) => location.zoneNames.map((zone) => [zone.id, zone.name])));
  return stock.map((row) => {
    const hero = updates
      .filter((update) => update.locationId === row.locationId && update.offeringId === row.offeringId)
      .map((update) => {
        const zone = update.zoneId ? zoneNames.get(update.zoneId) ?? "Zone" : "Chưa gửi";
        const status =
          update.reviewStatus === "APPROVED" ? "đã duyệt" : update.reviewStatus === "REJECTED" ? "từ chối" : "chờ duyệt";
        return `${zone}: ${status}`;
      });
    return {
      locationId: row.locationId,
      locationName: names.get(row.locationId) ?? "",
      offeringId: row.offeringId,
      offeringName: row.name,
      availableQty: remaining(row),
      status: row.status,
      hero: hero.length > 0 ? [...new Set(hero)].join(" · ") : "Chưa gửi duyệt",
    };
  });
}

export function viewerCanEditCatalog(viewer: ChainViewer, providerId: string): boolean {
  return canEditSharedCatalog(viewer.grants, providerId);
}
