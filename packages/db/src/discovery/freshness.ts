/** Organic new-provider window. After this, the badge drops without a manual edit. */
export const NEW_PROVIDER_WINDOW_DAYS = 14;

export type LocationFreshness = "UPCOMING" | "NEW";

export function locationFreshness(
  opensAt: Date | string | null | undefined,
  createdAt: Date | string | null | undefined,
  now = new Date(),
): LocationFreshness | null {
  const open = opensAt ? new Date(opensAt) : null;
  const created = createdAt ? new Date(createdAt) : null;
  const windowMs = NEW_PROVIDER_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (open && !Number.isNaN(open.getTime()) && open.getTime() > now.getTime()) {
    return "UPCOMING";
  }
  const start = open && !Number.isNaN(open.getTime()) ? open : created;
  if (!start || Number.isNaN(start.getTime())) return null;
  if (start.getTime() <= now.getTime() && now.getTime() - start.getTime() <= windowMs) {
    return "NEW";
  }
  return null;
}

export function freshnessLabel(freshness: LocationFreshness | null): string | null {
  if (freshness === "UPCOMING") return "Sắp khai trương";
  if (freshness === "NEW") return "Mới trong khu";
  return null;
}

export function promotionKindLabel(kind: string): string {
  switch (kind) {
    case "OPENING":
      return "Khai trương";
    case "GIFT":
      return "Tặng món";
    case "DISCOUNT":
      return "Giảm giá";
    case "NEW_ITEM":
      return "Món mới";
    case "HAPPY_HOUR":
      return "Giờ vàng";
    case "FAMILIAR":
      return "Khách quen";
    case "FLASH":
      return "Flash";
    default:
      return "Ưu đãi";
  }
}
