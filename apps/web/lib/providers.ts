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
  lat?: number | null;
  lng?: number | null;
  averageRating?: number | null;
  reviewCount?: number;
  sampleOffering?: string | null;
};

export function liveStatusLabel(status: string): string {
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
    default:
      return "";
  }
}
