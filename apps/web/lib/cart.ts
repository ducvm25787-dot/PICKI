export type CartLine = {
  offeringId: string;
  name: string;
  amountVnd: number;
  quantity: number;
};

export type Cart = {
  providerLocationId: string;
  zoneId: string;
  brandName: string;
  providerType?: string;
  items: CartLine[];
};

const CART_KEY = "picki_cart";

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
    return;
  }
  sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
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
  const cart: Cart =
    existing?.providerLocationId === base.providerLocationId
      ? existing
      : { ...base, items: [] };

  const idx = cart.items.findIndex((i) => i.offeringId === line.offeringId);
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
