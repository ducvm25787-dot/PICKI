/** Capability-aware CTA for familiar places. The label names the next action. */

export type FamiliarCta = {
  label: string;
  href: string;
  kind: "reorder" | "view_today" | "contact" | "open";
};

const CONTACT_TYPES = new Set([
  "BEAUTY",
  "SALON",
  "SPA",
  "NAIL",
  "AUTO_SERVICE",
  "SPORTS_FACILITY",
  "HOME_SERVICE",
  "CLEANER",
  "TECHNICIAN",
  "EDUCATION_PROVIDER",
  "TUTOR",
  "PET_SERVICE",
  "HEALTH_PROVIDER",
  "PHARMACY",
  "TRANSPORT_PROVIDER",
]);

const SHOP_TYPES = new Set([
  "MINIMART",
  "CONVENIENCE_STORE",
  "MARKET_VENDOR",
  "SPECIALTY_STORE",
  "RETAIL_STORE",
  "SUPERMARKET",
]);

export function familiarPrimaryCta(input: {
  locationId: string;
  providerType: string;
  zoneSlug: string;
}): FamiliarCta {
  const { locationId, providerType } = input;
  const t = providerType.toUpperCase();

  if (t === "HOME_COOK") {
    return {
      label: "Bữa tối",
      href: `/family-dinner/${locationId}`,
      kind: "view_today",
    };
  }
  if (t === "LAUNDRY" || t.includes("FOOD") || t === "RESTAURANT" || t === "CAFE" || t === "FOOD_STALL") {
    return {
      label: "Đặt lại",
      href: t === "LAUNDRY" ? `/locations/${locationId}` : `/locations/${locationId}?repeat=1`,
      kind: "reorder",
    };
  }
  if (CONTACT_TYPES.has(t)) {
    return { label: "Liên hệ", href: `/locations/${locationId}`, kind: "contact" };
  }
  if (SHOP_TYPES.has(t)) {
    return { label: "Mua lại", href: `/locations/${locationId}`, kind: "open" };
  }
  return {
    label: "Xem",
    href: `/locations/${locationId}`,
    kind: "open",
  };
}

export function usageHint(completed: number, favorite: boolean): string {
  if (completed >= 2) return `Nhà bạn đã đặt ${String(completed)} lần`;
  if (favorite) return "Đã lưu yêu thích";
  if (completed === 1) return "Đã dùng 1 lần";
  return "Chỗ quen của nhà mình";
}
