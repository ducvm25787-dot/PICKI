import { and, eq, isNull, or } from "drizzle-orm";
import {
  memberUserIdsForLocation,
  orders,
  providerLocations,
  providers,
  userIdentities,
  users,
  type PickiDb,
} from "@picki/db";

export async function loadProviderBrand(db: PickiDb, providerLocationId: string) {
  const row = await db
    .select({ brandName: providers.brandName })
    .from(providerLocations)
    .innerJoin(providers, eq(providers.id, providerLocations.providerId))
    .where(eq(providerLocations.id, providerLocationId))
    .limit(1);
  return row[0]?.brandName ?? null;
}

export async function loadUserPhone(db: PickiDb, userId: string): Promise<string | null> {
  const row = await db
    .select({ externalUserId: userIdentities.externalUserId })
    .from(userIdentities)
    .where(and(eq(userIdentities.userId, userId), eq(userIdentities.provider, "PHONE")))
    .limit(1);
  return row[0]?.externalUserId ?? null;
}

export async function loadProviderContactPhone(
  db: PickiDb,
  providerLocationId: string,
): Promise<string | null> {
  const staff = await memberUserIdsForLocation(db, providerLocationId);
  if (!staff[0]) return null;
  return loadUserPhone(db, staff[0]);
}

export async function loadRunnerSummary(db: PickiDb, runnerUserId: string | null) {
  if (!runnerUserId) return null;
  const row = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, runnerUserId))
    .limit(1);
  if (!row[0]) return { userId: runnerUserId, displayName: "Runner" };
  return {
    userId: row[0].id,
    displayName: row[0].displayName ?? "Runner",
  };
}

export type OrderContacts = {
  customer: { phone: string | null; displayName: string | null; avatarUrl: string | null };
  provider: { phone: string | null; label: string };
  runner: { phone: string | null; displayName: string | null } | null;
};

export async function loadServiceRequestContacts(
  db: PickiDb,
  request: { customerUserId: string; providerLocationId: string },
): Promise<OrderContacts> {
  const [customerPhone, providerPhone, brandName] = await Promise.all([
    loadUserPhone(db, request.customerUserId),
    loadProviderContactPhone(db, request.providerLocationId),
    loadProviderBrand(db, request.providerLocationId),
  ]);

  const customerRow = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, request.customerUserId))
    .limit(1);

  return {
    customer: {
      phone: customerPhone,
      displayName: customerRow[0]?.displayName ?? null,
      avatarUrl: customerRow[0]?.avatarUrl ?? null,
    },
    provider: {
      phone: providerPhone,
      label: brandName ?? "Tiệm",
    },
    runner: null,
  };
}

export async function loadOrderContacts(
  db: PickiDb,
  order: typeof orders.$inferSelect,
): Promise<OrderContacts> {
  const [customerPhone, providerPhone, brandName, runnerSummary, runnerPhone] = await Promise.all([
    loadUserPhone(db, order.customerUserId),
    loadProviderContactPhone(db, order.providerLocationId),
    loadProviderBrand(db, order.providerLocationId),
    order.runnerUserId ? loadRunnerSummary(db, order.runnerUserId) : Promise.resolve(null),
    order.runnerUserId ? loadUserPhone(db, order.runnerUserId) : Promise.resolve(null),
  ]);

  const customerRow = await db
    .select({ displayName: users.displayName, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, order.customerUserId))
    .limit(1);

  return {
    customer: {
      phone: customerPhone,
      displayName: customerRow[0]?.displayName ?? null,
      avatarUrl: customerRow[0]?.avatarUrl ?? null,
    },
    provider: {
      phone: providerPhone,
      label: brandName ?? "Tiệm",
    },
    runner: runnerSummary
      ? { phone: runnerPhone, displayName: runnerSummary.displayName }
      : null,
  };
}

export function orderHandoffFields(order: typeof orders.$inferSelect) {
  return {
    estimatedReadyAt: order.estimatedReadyAt?.toISOString() ?? null,
    providerHandoffAt: order.providerHandoffAt?.toISOString() ?? null,
    runnerSoughtAt: order.runnerSoughtAt?.toISOString() ?? null,
    runnerUserId: order.runnerUserId,
  };
}
