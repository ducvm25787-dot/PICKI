export type ClassifiedListing = {
  id: string;
  listingNumber: string;
  zoneId: string;
  sellerUserId: string;
  listingType:
    | "RESALE"
    | "GIVE_AWAY"
    | "CHO_THUE"
    | "O_GHEP"
    | "LOST_FOUND"
    | "PET_LOST";
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
  expiresAt?: string | null;
  createdAt: string;
  sellerDisplayName?: string | null;
  reservedByDisplayName?: string | null;
  mine?: boolean;
  reservedByMe?: boolean;
};

export function isHousingListingType(type: string): boolean {
  return type === "CHO_THUE" || type === "O_GHEP";
}

export function isLostListingType(type: string): boolean {
  return type === "LOST_FOUND" || type === "PET_LOST";
}

export function isContactOnlyListingType(type: string): boolean {
  return isHousingListingType(type) || isLostListingType(type);
}

export function classifiedTypeLabel(type: string): string {
  switch (type) {
    case "GIVE_AWAY":
      return "Cho tặng";
    case "CHO_THUE":
      return "Cho thuê";
    case "O_GHEP":
      return "Ở ghép";
    case "LOST_FOUND":
      return "Thất lạc";
    case "PET_LOST":
      return "Thú cưng thất lạc";
    default:
      return "Thanh lý";
  }
}

export function classifiedStatusLabel(status: string, listingType?: string): string {
  const contactOnly = isContactOnlyListingType(listingType ?? "");
  switch (status) {
    case "AVAILABLE":
      return contactOnly ? "Đang đăng" : "Đang mở";
    case "RESERVED":
      return "Đã giữ chỗ";
    case "COMPLETED":
      return "Đã bán";
    case "GIVEN":
      return "Đã tặng";
    case "ARCHIVED":
      return contactOnly ? "Đã ẩn / hết hạn" : "Đã ẩn";
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
  if (isLostListingType(listingType)) return "Không mua bán";
  if (priceVnd == null) return "Liên hệ";
  if (isHousingListingType(listingType)) {
    return `${priceVnd.toLocaleString("vi-VN")}đ/tháng`;
  }
  return `${priceVnd.toLocaleString("vi-VN")}đ`;
}
