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

function beautyWaitLabel(status: string, waitMinutes: number | null | undefined): string {
  if (status === "CLOSED") return "Tạm hết lượt";
  if (status === "OFFLINE") return "Đóng cửa";
  const wait = waitMinutes ?? 0;
  if (status === "OPEN" && wait <= 0) return "Ra được ngay";
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
  if (isBeautyVertical(providerType)) {
    return beautyWaitLabel(status, estimatedWaitMinutes);
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

export function fulfillmentLabel(mode: string | null | undefined): string {
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
      return "Tại tiệm";
    default:
      return "";
  }
}

export function beautyWaitDisplay(
  status: string,
  estimatedWaitMinutes?: number | null,
): string {
  return `${beautyWaitEmoji(status, estimatedWaitMinutes)} ${beautyWaitLabel(status, estimatedWaitMinutes)}`;
}

export function isLaundryVertical(providerType?: string | null) {
  return providerType === "LAUNDRY";
}

export function orderButtonLabel(providerType?: string | null) {
  if (isHomeServiceVertical(providerType)) return "Gửi yêu cầu";
  return isLaundryVertical(providerType) ? "Đặt hàng" : "Đặt món";
}

export function serviceRequestStatusLabel(status: string): string {
  switch (status) {
    case "OPEN":
      return "Chờ thợ phản hồi";
    case "CONFIRMED":
      return "Thợ đã nhận";
    case "IN_PROGRESS":
      return "Đang thực hiện";
    case "COMPLETED":
      return "Hoàn tất";
    case "PROVIDER_REJECTED":
      return "Thợ từ chối";
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
