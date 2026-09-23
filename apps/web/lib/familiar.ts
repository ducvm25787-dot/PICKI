/** Capability-aware CTA for familiar / home cards. */

export type FamiliarCta = {
  label: string;
  href: string;
  kind: "reorder" | "view_today" | "contact" | "open";
};

export function familiarPrimaryCta(input: {
  locationId: string;
  providerType: string;
  zoneSlug: string;
}): FamiliarCta {
  const { locationId, providerType, zoneSlug } = input;
  const t = providerType.toUpperCase();

  if (t.includes("FOOD") || t === "RESTAURANT" || t === "CAFE" || t === "FOOD_STALL") {
    return {
      label: "Đặt lại",
      href: `/locations/${locationId}?repeat=1`,
      kind: "reorder",
    };
  }
  if (t.includes("FAMILY") || t === "HOME_COOK") {
    return {
      label: "Tối nay",
      href: `/family-dinner/${locationId}`,
      kind: "view_today",
    };
  }
  // Family dinner demo kitchen often FOOD_STALL / similar — brand path via location menu
  if (t === "LAUNDRY") {
    return { label: "Đặt lại", href: `/locations/${locationId}`, kind: "reorder" };
  }
  if (t === "BEAUTY" || t === "AUTO_SERVICE" || t === "SPORTS") {
    return { label: "Liên hệ", href: `/locations/${locationId}`, kind: "contact" };
  }
  if (
    t === "HOME_SERVICE" ||
    t === "EDUCATION" ||
    t === "PET" ||
    t === "HEALTH_PROVIDER" ||
    t === "PHARMACY" ||
    t === "TRANSPORT_PROVIDER"
  ) {
    return { label: "Liên hệ", href: `/locations/${locationId}`, kind: "contact" };
  }
  if (t === "MINIMART" || t === "MARKET_VENDOR" || t === "RETAIL_STORE") {
    return { label: "Mua lại", href: `/locations/${locationId}`, kind: "contact" };
  }
  return {
    label: "Mở quán",
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
