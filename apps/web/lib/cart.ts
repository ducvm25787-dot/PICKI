export type CartLine = {
  offeringId: string;
  name: string;
  amountVnd: number;
  quantity: number;
  fulfillmentMode?: string | null;
  estimatedDays?: number | null;
  pricingKind?: string | null;
  optionIds?: string[];
  alcoholRestricted?: boolean;
};

export type Cart = {
  providerLocationId: string;
  zoneId: string;
  brandName: string;
  providerType?: string;
  /** Set for Sáng mai giao. Same-shop carts do not mix dates or slots. */
  serviceDate?: string | null;
  scheduledDeliveryWindowId?: string | null;
  scheduledWindowLabel?: string | null;
  items: CartLine[];
};

const CART_KEY = "picki_cart";

function optionKey(offeringId: string, optionIds?: string[]) {
  return `${offeringId}:${[...(optionIds ?? [])].sort().join(",")}`;
}

export function readCart(): Cart | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(CART_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Cart;
  } catch {
    return null;
  }
}

export function writeCart(cart: Cart | null) {
  if (typeof window === "undefined") return;
  if (!cart || cart.items.length === 0) {
    sessionStorage.removeItem(CART_KEY);
  } else {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
  }
  window.dispatchEvent(new Event("picki-cart"));
}

export function cartItemCount(cart: Cart | null): number {
  return cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0;
}

export function cartTotalVnd(cart: Cart | null): number {
  return cart?.items.reduce((n, i) => n + i.amountVnd * i.quantity, 0) ?? 0;
}

export function addToCart(
  base: Omit<Cart, "items">,
  line: Omit<CartLine, "quantity">,
  quantity = 1,
): Cart {
  const existing = readCart();
  const sameShop = existing?.providerLocationId === base.providerLocationId;
  const sameSchedule =
    (existing?.serviceDate ?? null) === (base.serviceDate ?? null) &&
    (existing?.scheduledDeliveryWindowId ?? null) === (base.scheduledDeliveryWindowId ?? null);
  const cart: Cart = sameShop && sameSchedule ? existing! : { ...base, items: [] };

  const incomingMode = line.fulfillmentMode ?? "PICKUP_AND_RETURN";
  const existingMode = cart.items[0]?.fulfillmentMode ?? "PICKUP_AND_RETURN";
  if (cart.items.length > 0 && incomingMode !== existingMode) {
    throw new Error("MIXED_FULFILLMENT");
  }

  const incomingKey = optionKey(line.offeringId, line.optionIds);
  const idx = cart.items.findIndex((i) => optionKey(i.offeringId, i.optionIds) === incomingKey);
  if (idx >= 0) {
    cart.items[idx] = {
      ...cart.items[idx]!,
      quantity: cart.items[idx]!.quantity + quantity,
    };
  } else {
    cart.items.push({ ...line, quantity });
  }

  writeCart(cart);
  return cart;
}

export function setCartLineQuantity(
  offeringId: string,
  optionIds: string[] | undefined,
  quantity: number,
): Cart | null {
  const existing = readCart();
  if (!existing) return null;
  const key = optionKey(offeringId, optionIds);
  const items = existing.items.flatMap((line) => {
    if (optionKey(line.offeringId, line.optionIds) !== key) return [line];
    if (quantity < 1) return [];
    return [{ ...line, quantity }];
  });
  const next = items.length > 0 ? { ...existing, items } : null;
  writeCart(next);
  return next;
}
