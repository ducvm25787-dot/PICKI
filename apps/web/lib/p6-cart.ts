import {
  P6_DIRECT_CART_KEY,
  P6_TRIP_CART_KEY,
  commerceContextForEntry,
  type MarketEntry,
} from "@picki/shared";

export type P6Line = {
  offeringId: string;
  name: string;
  amountVnd: number;
  quantity: number;
  locationId: string;
  brandName: string;
};

export type P6Cart = {
  context: "MARKET_TRIP" | "DIRECT";
  clusterSlug: string | null;
  zoneId: string;
  items: P6Line[];
};

export const P6_CART_EVENT = "picki-p6-cart";

function storageKey(entry: MarketEntry) {
  return entry === "CLUSTER" ? P6_TRIP_CART_KEY : P6_DIRECT_CART_KEY;
}

export function readP6Cart(entry: MarketEntry): P6Cart | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(storageKey(entry));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as P6Cart;
  } catch {
    return null;
  }
}

function writeP6Cart(entry: MarketEntry, cart: P6Cart | null) {
  if (!cart || cart.items.length === 0) sessionStorage.removeItem(storageKey(entry));
  else sessionStorage.setItem(storageKey(entry), JSON.stringify(cart));
  window.dispatchEvent(new Event(P6_CART_EVENT));
}

export function p6ItemCount(entry: MarketEntry): number {
  return readP6Cart(entry)?.items.reduce((sum, line) => sum + line.quantity, 0) ?? 0;
}

/** Writes one P6 cart. The other entry's cart is left as it is. */
export function addToP6Cart(input: {
  entry: MarketEntry;
  clusterSlug: string | null;
  zoneId: string;
  locationId: string;
  brandName: string;
  line: { offeringId: string; name: string; amountVnd: number };
  quantity?: number;
}): P6Cart {
  const quantity = input.quantity ?? 1;
  const existing = readP6Cart(input.entry);
  const context = commerceContextForEntry(input.entry);
  const base: P6Cart =
    input.entry === "STORE" && existing && existing.items[0]?.locationId !== input.locationId
      ? { context, clusterSlug: null, zoneId: input.zoneId, items: [] }
      : {
          context,
          clusterSlug: input.entry === "CLUSTER" ? input.clusterSlug : null,
          zoneId: input.zoneId,
          items: existing?.items ?? [],
        };
  const idx = base.items.findIndex(
    (line) => line.offeringId === input.line.offeringId && line.locationId === input.locationId,
  );
  if (idx >= 0) {
    const current = base.items[idx]!;
    base.items[idx] = { ...current, quantity: current.quantity + quantity };
  } else {
    base.items.push({
      ...input.line,
      quantity,
      locationId: input.locationId,
      brandName: input.brandName,
    });
  }
  writeP6Cart(input.entry, base);
  return base;
}
