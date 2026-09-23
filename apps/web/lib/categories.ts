/** 10 danh mục lớn — Home «TIỆN ÍCH QUANH NHÀ» + browse filter. */

export type HomeCategoryId =
  | "food"
  | "market"
  | "beauty"
  | "cleaning"
  | "repair"
  | "education"
  | "pet"
  | "health"
  | "sports"
  | "transport";

export type HomeCategory = {
  id: HomeCategoryId;
  emoji: string;
  label: string;
  /** Short label for 2-col home grid */
  shortLabel: string;
  /** Chips / mô tả bên trong (UI only; Beauty = filter type, tags sau) */
  subs: string[];
  providerTypes: string[];
  /** Deep links hiện sẵn trên trang danh mục */
  deepLinks?: { href: string; label: string }[];
};

export const HOME_CATEGORIES: HomeCategory[] = [
  {
    id: "food",
    emoji: "🍜",
    label: "Ăn uống",
    shortLabel: "Ăn uống",
    subs: [
      "Bữa sáng",
      "Bữa tối ấm cúng",
      "Cơm / bún / phở",
      "Ăn vặt",
      "Đồ uống",
      "Nhà hàng",
      "Quán nhậu",
      "Ăn khuya",
    ],
    providerTypes: ["RESTAURANT", "FOOD_STALL", "HOME_COOK", "CAFE", "CAFÉ", "BAKERY", "FOOD"],
    deepLinks: [
      { href: "/breakfast", label: "Bữa sáng (đặt trước)" },
      { href: "/family-dinner", label: "Bữa tối ấm cúng" },
      { href: "/late-night", label: "Ăn khuya" },
    ],
  },
  {
    id: "market",
    emoji: "🛒",
    label: "Đi chợ & Mua sắm",
    shortLabel: "Đi chợ",
    subs: [
      "Chợ truyền thống",
      "Thực phẩm tươi",
      "Hoa quả",
      "Sữa",
      "Minimart",
      "Tạp hóa",
      "Siêu thị",
      "Đồ gia đình",
    ],
    providerTypes: ["MINIMART", "MARKET_VENDOR", "RETAIL_STORE", "SUPERMARKET"],
  },
  {
    id: "beauty",
    emoji: "✨",
    label: "Làm đẹp",
    shortLabel: "Làm đẹp",
    subs: ["Cắt tóc", "Gội đầu", "Nail", "Mi", "Spa", "Massage", "Skincare"],
    providerTypes: ["BEAUTY"],
  },
  {
    id: "cleaning",
    emoji: "🧹",
    label: "Vệ sinh & Giặt là",
    shortLabel: "Vệ sinh",
    subs: ["Dọn nhà", "Tổng vệ sinh", "Giặt quần áo", "Chăn ga", "Giày", "Rèm", "Sofa", "Đệm"],
    providerTypes: ["LAUNDRY"],
  },
  {
    id: "repair",
    emoji: "🔧",
    label: "Sửa chữa & Nhà cửa",
    shortLabel: "Sửa chữa",
    subs: [
      "Điện",
      "Nước",
      "Khóa",
      "Điều hòa",
      "Máy giặt",
      "Tủ lạnh",
      "TV",
      "Đồ điện gia dụng",
      "Lắp đặt",
    ],
    providerTypes: ["HOME_SERVICE", "AUTO_SERVICE"],
  },
  {
    id: "education",
    emoji: "📚",
    label: "Giáo dục",
    shortLabel: "Giáo dục",
    subs: ["Gia sư", "Học thêm", "Ngoại ngữ", "Năng khiếu", "Lớp trẻ em"],
    providerTypes: ["EDUCATION_PROVIDER", "TUTOR"],
  },
  {
    id: "pet",
    emoji: "🐶",
    label: "Thú cưng",
    shortLabel: "Thú cưng",
    subs: ["Tắm/cắt", "Grooming", "Trông pet", "Pet hotel", "Thức ăn/phụ kiện", "Thú y", "Tìm pet"],
    providerTypes: ["PET_SERVICE"],
  },
  {
    id: "health",
    emoji: "❤️",
    label: "Sức khỏe",
    shortLabel: "Sức khỏe",
    subs: ["Nhà thuốc", "Cơ sở khám", "Trị liệu", "Đông y", "Chăm sóc"],
    providerTypes: ["PHARMACY", "HEALTH_PROVIDER"],
  },
  {
    id: "sports",
    emoji: "🏸",
    label: "Thể thao",
    shortLabel: "Thể thao",
    subs: ["Pickleball", "Bóng đá", "Cầu lông", "Tennis", "Đặt sân", "Khung giờ"],
    providerTypes: ["SPORTS_FACILITY"],
  },
  {
    id: "transport",
    emoji: "🚗",
    label: "Xe đưa đón",
    shortLabel: "Đưa đón",
    subs: [
      "Sân bay",
      "Về quê",
      "Du lịch / liên tỉnh",
      "Đưa đón học sinh",
      "Thuê xe có tài xế",
    ],
    providerTypes: ["TRANSPORT_PROVIDER"],
  },
];

export function getHomeCategory(id: string): HomeCategory | undefined {
  return HOME_CATEGORIES.find((c) => c.id === id);
}

/** Compact Home strip — remaining categories behind «Tất cả». */
export const HOME_CATEGORY_PRIMARY_IDS: HomeCategoryId[] = [
  "food",
  "market",
  "beauty",
  "repair",
  "cleaning",
];

export function homeCategoriesPrimary(): HomeCategory[] {
  return HOME_CATEGORY_PRIMARY_IDS.map((id) => getHomeCategory(id)!).filter(Boolean);
}

export function homeCategoriesSecondary(): HomeCategory[] {
  const primary = new Set(HOME_CATEGORY_PRIMARY_IDS);
  return HOME_CATEGORIES.filter((c) => !primary.has(c.id));
}

/** Map discovery block id → browse / deep link. */
export function browseHrefForDiscoveryBlock(
  blockId: string,
  zoneSlug: string,
): string {
  switch (blockId) {
    case "breakfast-preorder":
      return "/breakfast";
    case "breakfast-instant":
      return `/zones/${zoneSlug}/browse/food`;
    case "late-snack":
      return "/late-night";
    case "dinner-plan":
    case "dinner-rescue":
      return "/family-dinner";
    case "laundry":
      return `/zones/${zoneSlug}/browse/cleaning`;
    case "beauty":
      return `/zones/${zoneSlug}/browse/beauty`;
    case "home-services":
      return `/zones/${zoneSlug}/browse/repair`;
    case "education":
      return `/zones/${zoneSlug}/browse/education`;
    case "pet":
      return `/zones/${zoneSlug}/browse/pet`;
    case "health":
    case "pharmacy":
      return `/zones/${zoneSlug}/browse/health`;
    case "market":
    case "di-cho":
      return `/zones/${zoneSlug}/browse/market`;
    case "sports":
      return `/zones/${zoneSlug}/browse/sports`;
    case "transport":
      return `/zones/${zoneSlug}/browse/transport`;
    case "lunch":
      return `/zones/${zoneSlug}/browse/food`;
    default:
      if (blockId.includes("food") || blockId.includes("lunch") || blockId.includes("snack")) {
        return `/zones/${zoneSlug}/browse/food`;
      }
      return `/zones/${zoneSlug}/browse/food`;
  }
}
