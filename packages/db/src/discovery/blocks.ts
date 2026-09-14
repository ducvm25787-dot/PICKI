export type FoodMoment =
  | "BREAKFAST_PREORDER"
  | "BREAKFAST_INSTANT"
  | "LUNCH"
  | "DINNER"
  | "SNACK"
  | "GROCERY"
  | "FAMILY_MEAL";

export type DiscoveryBlock = {
  id: string;
  title: string;
  subtitle: string;
  foodMoments: FoodMoment[];
};

/** Rule-based discovery windows (§61) — Asia/Ho_Chi_Minh, no AI. */
export function discoveryBlocksForNow(now = new Date()): DiscoveryBlock[] {
  const hour = getVietnamHour(now);

  if (hour >= 20 || hour < 5) {
    return [
      {
        id: "breakfast-preorder",
        title: "SÁNG MAI ĂN GÌ?",
        subtitle: "Đặt trước — giao 6:30–8:00",
        foodMoments: ["BREAKFAST_PREORDER"],
      },
      {
        id: "late-snack",
        title: "ĂN KHUYA",
        subtitle: "Chè, ốc, tiện ích đêm",
        foodMoments: ["SNACK"],
      },
    ];
  }
  if (hour >= 5 && hour < 10) {
    return [
      {
        id: "breakfast-instant",
        title: "ĂN SÁNG",
        subtitle: "Phở, bún, xôi, bánh mì — giao ngay",
        foodMoments: ["BREAKFAST_INSTANT", "BREAKFAST_PREORDER"],
      },
    ];
  }
  if (hour >= 10 && hour < 14) {
    return [
      {
        id: "lunch",
        title: "ĂN TRƯA NHANH",
        subtitle: "Cơm, phở, bún — quanh CT Kim Văn",
        foodMoments: ["LUNCH", "BREAKFAST_INSTANT"],
      },
    ];
  }
  if (hour >= 14 && hour < 16) {
    return [
      {
        id: "dinner-plan",
        title: "TỐI NAY NHÀ MÌNH ĂN GÌ?",
        subtitle: "Mâm cơm, món mặn, chợ",
        foodMoments: ["FAMILY_MEAL", "GROCERY", "DINNER"],
      },
    ];
  }
  if (hour >= 16 && hour < 20) {
    return [
      {
        id: "dinner-rescue",
        title: "CỨU BỮA TỐI",
        subtitle: "Mâm làm sẵn · giao tối",
        foodMoments: ["DINNER", "FAMILY_MEAL", "LUNCH"],
      },
    ];
  }
  return [
    {
      id: "late-snack",
      title: "ĂN KHUYA",
      subtitle: "Chè, nem, đồ ăn vặt",
      foodMoments: ["SNACK", "DINNER"],
    },
  ];
}

function getVietnamHour(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "12";
  return Number(hour);
}
