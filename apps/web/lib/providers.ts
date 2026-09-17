export type ProviderListing = {
  locationId: string;
  providerId: string;
  brandName: string;
  displayName: string;
  providerType: string;
  tagline: string | null;
  liveStatus: string;
  addressLine: string | null;
  prepMinutes?: number | null;
  etaMinutes?: number | null;
  estimatedWaitMinutes?: number | null;
  lat?: number | null;
  lng?: number | null;
  averageRating?: number | null;
  reviewCount?: number;
  sampleOffering?: string | null;
};

export function isHomeServiceVertical(providerType?: string | null) {
  return providerType === "HOME_SERVICE";
}

export function isBeautyVertical(providerType?: string | null) {
  return providerType === "BEAUTY";
}

export function isPetVertical(providerType?: string | null) {
  return providerType === "PET_SERVICE";
}

export function isAutoVertical(providerType?: string | null) {
  return providerType === "AUTO_SERVICE";
}

export function isHealthVertical(providerType?: string | null) {
  return providerType === "HEALTH_PROVIDER";
}

export function isPharmacyVertical(providerType?: string | null) {
  return providerType === "PHARMACY";
}

export function isMarketVertical(providerType?: string | null) {
  return (
    providerType === "MINIMART" ||
    providerType === "MARKET_VENDOR" ||
    providerType === "RETAIL_STORE"
  );
}

export function isCustomerVisitVertical(providerType?: string | null) {
  return (
    isBeautyVertical(providerType) ||
    isPetVertical(providerType) ||
    isAutoVertical(providerType) ||
    isHealthVertical(providerType)
  );
}

/** Tiệm chỉ queue (beauty/auto/phòng khám) — không tab Yêu cầu dịch vụ */
export function isQueueOnlyShop(providerType?: string | null) {
  return isBeautyVertical(providerType) || isAutoVertical(providerType) || isHealthVertical(providerType);
}

/** Nhà thuốc / tạp hóa: chỉ live + liên hệ — không đơn / queue / yêu cầu */
export function isContactLiveOnlyShop(providerType?: string | null) {
  return isPharmacyVertical(providerType) || isMarketVertical(providerType);
}

export function isEducationVertical(providerType?: string | null) {
  return providerType === "EDUCATION_PROVIDER" || providerType === "TUTOR";
}

export function isSportsVertical(providerType?: string | null) {
  return providerType === "SPORTS_FACILITY";
}

export function isHomeCookVertical(providerType?: string | null) {
  return providerType === "HOME_COOK";
}

/** Quán ăn uống — tab Sáng mai (RESTAURANT / FOOD_STALL / HOME_COOK / CAFÉ / bakery-like). */
export function isFoodBreakfastVertical(providerType?: string | null) {
  if (!providerType) return false;
  const food = new Set([
    "RESTAURANT",
    "FOOD_STALL",
    "HOME_COOK",
    "CAFE",
    "CAFÉ",
    "BAKERY",
    "FOOD",
  ]);
  return food.has(providerType);
}

function beautyWaitLabel(
  status: string,
  waitMinutes: number | null | undefined,
  providerType?: string | null,
): string {
  const health = isHealthVertical(providerType);
  if (status === "CLOSED") return health ? "Tạm ngừng nhận khám" : "Tạm hết lượt";
  if (status === "OFFLINE") return "Đóng cửa";
  const wait = waitMinutes ?? 0;
  if (status === "OPEN" && wait <= 0) return health ? "Khám được ngay" : "Ra được ngay";
  if (wait <= 15) return wait > 0 ? `~${String(wait)} phút` : "~15 phút";
  return `~${String(wait)} phút`;
}

function beautyWaitEmoji(status: string, waitMinutes: number | null | undefined): string {
  if (status === "CLOSED" || status === "OFFLINE") return "🔴";
  const wait = waitMinutes ?? 0;
  if (status === "OPEN" && wait <= 0) return "🟢";
  if (wait <= 15) return "🟡";
  return "🟠";
}

export function liveStatusLabel(
  status: string,
  providerType?: string | null,
  estimatedWaitMinutes?: number | null,
): string {
  if (isEducationVertical(providerType)) {
    return "Đang mở";
  }
  if (isPharmacyVertical(providerType) || isMarketVertical(providerType)) {
    switch (status) {
      case "OPEN":
        return "Đang mở";
      case "BUSY":
        return "Đông khách";
      case "CLOSED":
        return "Đã đóng";
      default:
        return "Chưa cập nhật";
    }
  }
  if (isCustomerVisitVertical(providerType)) {
    return beautyWaitLabel(status, estimatedWaitMinutes, providerType);
  }
  if (isHomeServiceVertical(providerType)) {
    switch (status) {
      case "OPEN":
        return "Đang nhận việc";
      case "BUSY":
        return "Có thể tới sau ~1h";
      case "CLOSED":
        return "Hết lịch hôm nay";
      default:
        return "Chưa cập nhật";
    }
  }
  switch (status) {
    case "OPEN":
      return "Đang mở";
    case "BUSY":
      return "Đang bận";
    case "CLOSED":
      return "Đã đóng";
    default:
      return "Offline";
  }
}

export function liveStatusClass(status: string): string {
  switch (status) {
    case "OPEN":
      return "live-open";
    case "BUSY":
      return "live-busy";
    case "CLOSED":
      return "live-closed";
    default:
      return "live-offline";
  }
}

export function fulfillmentLabel(
  mode: string | null | undefined,
  providerType?: string | null,
): string {
  switch (mode) {
    case "PREORDER":
      return "Đặt trước";
    case "INSTANT":
      return "Giao ngay";
    case "PICKUP":
      return "Tự lấy";
    case "PICKUP_AND_RETURN":
      return "Lấy & trả tận nhà";
    case "ON_SITE":
      return "Giặt tại nhà";
    case "PROVIDER_VISIT":
      return "Thợ đến nhà";
    case "CUSTOMER_VISIT":
      if (isEducationVertical(providerType)) return "Tại lớp";
      if (isPetVertical(providerType)) return "Mang pet tới tiệm";
      if (isAutoVertical(providerType)) return "Mang xe tới";
      if (isSportsVertical(providerType)) return "Tới sân";
      if (isHealthVertical(providerType)) return "Tới phòng khám";
      return "Tại tiệm";
    case "CONTACT_ONLY":
      if (isHealthVertical(providerType)) return "Liên hệ phòng khám";
      if (isPharmacyVertical(providerType) || isMarketVertical(providerType)) return "Gọi hỏi / qua lấy";
      return "Liên hệ tiệm";
    case "ONLINE":
      return "Học online";
    default:
      return "";
  }
}

export function beautyWaitDisplay(
  status: string,
  estimatedWaitMinutes?: number | null,
  providerType?: string | null,
): string {
  return `${beautyWaitEmoji(status, estimatedWaitMinutes)} ${beautyWaitLabel(status, estimatedWaitMinutes, providerType)}`;
}

export function isLaundryVertical(providerType?: string | null) {
  return providerType === "LAUNDRY";
}

export function orderButtonLabel(providerType?: string | null) {
  if (isHomeServiceVertical(providerType)) return "Gửi yêu cầu";
  return isLaundryVertical(providerType) ? "Đặt hàng" : "Đặt món";
}

export function serviceRequestStatusLabel(
  status: string,
  providerType?: string | null,
): string {
  const edu = isEducationVertical(providerType);
  const sports = isSportsVertical(providerType);
  switch (status) {
    case "OPEN":
      return edu
        ? "Đợi Phụ trách lớp phản hồi"
        : sports
          ? "Đợi sân xác nhận"
          : "Chờ thợ phản hồi";
    case "CONFIRMED":
      return edu ? "Chờ tạo lịch học thử" : sports ? "Sân đã giữ chỗ" : "Thợ đã nhận";
    case "UPCOMING":
      return edu ? "Đã sắp lịch — chờ buổi học thử" : status;
    case "IN_PROGRESS":
      return edu ? "Đang diễn ra" : sports ? "Đang chơi" : "Đang thực hiện";
    case "COMPLETED":
      return edu ? "Đã hoàn thành buổi học" : sports ? "Ca sân xong" : "Hoàn tất";
    case "PROVIDER_REJECTED":
      return edu ? "Trung tâm từ chối" : sports ? "Sân từ chối" : "Thợ từ chối";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

const LAUNDRY_PRICE_UNITS: Record<string, string> = {
  "giat-quan-ao": "/kg",
  "giat-chan-man": "/bộ",
  "giat-giay": "/đôi",
  "giat-rem": "/m²",
  "giat-sofa-tham-dem": "/lần",
};

export function laundryPriceUnit(slug?: string | null): string | null {
  if (!slug) return null;
  return LAUNDRY_PRICE_UNITS[slug] ?? null;
}
