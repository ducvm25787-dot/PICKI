export type ClassifiedListing = {
  id: string;
  listingNumber: string;
  zoneId: string;
  sellerUserId: string;
  listingType: "RESALE" | "GIVE_AWAY";
  status: string;
  title: string;
  description: string | null;
  priceVnd: number | null;
  condition: string | null;
  photoUrl: string | null;
  photoUrls: string[];
  locationLabel: string;
  reservedByUserId: string | null;
  reservedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  sellerDisplayName?: string | null;
  reservedByDisplayName?: string | null;
  mine?: boolean;
  reservedByMe?: boolean;
};

export function classifiedTypeLabel(type: string): string {
  return type === "GIVE_AWAY" ? "Cho tặng" : "Thanh lý";
}

export function classifiedStatusLabel(status: string, listingType?: string): string {
  switch (status) {
    case "AVAILABLE":
      return "Đang mở";
    case "RESERVED":
      return "Đã giữ chỗ";
    case "COMPLETED":
      return "Đã bán";
    case "GIVEN":
      return "Đã tặng";
    case "ARCHIVED":
      return "Đã ẩn";
    default:
      return status;
  }
}

export function classifiedConditionLabel(condition: string | null): string | null {
  switch (condition) {
    case "NEW":
      return "Mới";
    case "LIKE_NEW":
      return "Như mới";
    case "GOOD":
      return "Tốt";
    case "FAIR":
      return "Khá";
    default:
      return null;
  }
}

export function formatPriceVnd(priceVnd: number | null, listingType: string): string {
  if (listingType === "GIVE_AWAY") return "Miễn phí";
  if (priceVnd == null) return "Liên hệ";
  return `${priceVnd.toLocaleString("vi-VN")}đ`;
}
