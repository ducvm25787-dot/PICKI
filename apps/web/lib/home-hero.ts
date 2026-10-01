/** Habit-First Context Now — configurable windows (pilot VN local clock). */

export type ContextWindowId =
  | "breakfast-morning"
  | "lunch"
  | "family-dinner"
  | "breakfast-preorder"
  | "overnight";

export type ContextNowContent = {
  id: ContextWindowId;
  kicker: string;
  title: string;
  copy: string;
  cta: string;
  href: string;
  tone: "dinner" | "breakfast" | "day" | "evening" | "weekend";
};

type WindowRule = {
  id: ContextWindowId;
  startHour: number;
  endHour: number;
  days?: number[];
  content: Omit<ContextNowContent, "id">;
};

/** First match wins. Food dayparts outrank weekend copy. 00:00–06:00 is not a meal. */
const DEFAULT_RULES: WindowRule[] = [
  {
    id: "breakfast-morning",
    startHour: 6,
    endHour: 9,
    content: {
      kicker: "Ăn sáng",
      title: "Ăn sáng",
      copy: "Menu sáng còn suất · giao quanh nhà.",
      cta: "Xem quán đang bán →",
      href: "/breakfast",
      tone: "breakfast",
    },
  },
  {
    id: "lunch",
    startHour: 9,
    endHour: 13,
    content: {
      kicker: "Bữa trưa vui vẻ",
      title: "Bữa trưa vui vẻ",
      copy: "Món trưa theo ngày · giao trong khung.",
      cta: "Xem quán trưa →",
      href: "/lunch",
      tone: "day",
    },
  },
  {
    id: "family-dinner",
    startHour: 13,
    endHour: 20,
    content: {
      kicker: "Bữa tối ấm cúng",
      title: "Tối nay nhà mình ăn gì?",
      copy: "Cơm nhà vừa nấu · giao đúng giờ.",
      cta: "Xem bữa tối →",
      href: "/family-dinner",
      tone: "dinner",
    },
  },
  {
    id: "breakfast-preorder",
    startHour: 20,
    endHour: 24,
    content: {
      kicker: "Sáng mai ăn gì?",
      title: "Sáng mai ăn gì?",
      copy: "Đặt tối nay · giao sáng sớm quanh nhà.",
      cta: "Xem quán nhận đơn →",
      href: "/breakfast",
      tone: "breakfast",
    },
  },
  {
    id: "overnight",
    startHour: 0,
    endHour: 6,
    content: {
      kicker: "Quanh nhà",
      title: "Quanh bạn lúc này",
      copy: "Chỗ đang mở trong khu. Ăn sáng bắt đầu từ 06:00.",
      cta: "Xem quanh nhà →",
      href: "/zones/kim-van-kim-lu/browse/food",
      tone: "evening",
    },
  },
];

function loadRules(): WindowRule[] {
  const raw = process.env.HABIT_CONTEXT_WINDOWS;
  if (!raw) return DEFAULT_RULES;
  try {
    const parsed = JSON.parse(raw) as WindowRule[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_RULES;
  } catch {
    return DEFAULT_RULES;
  }
}

export function contextNowFor(now: Date = new Date()): ContextNowContent {
  const hour = now.getHours();
  const day = now.getDay();
  for (const rule of loadRules()) {
    if (rule.days && !rule.days.includes(day)) continue;
    if (hour >= rule.startHour && hour < rule.endHour) {
      return { id: rule.id, ...rule.content };
    }
  }
  const fallback = DEFAULT_RULES.find((rule) => rule.id === "overnight") ?? DEFAULT_RULES[0]!;
  return { id: fallback.id, ...fallback.content };
}

export type HomeHeroSlot = "family-dinner" | "breakfast";

export function homeHeroSlot(now: Date = new Date()): HomeHeroSlot {
  const hour = now.getHours();
  if (hour >= 20 || (hour >= 6 && hour < 9)) return "breakfast";
  return "family-dinner";
}

export const HOME_HERO = {
  "family-dinner": {
    href: "/family-dinner",
    kicker: "Bữa tối ấm cúng",
    title: "Tối nay nhà mình ăn gì?",
    copy: "Cơm nhà vừa nấu · giao đúng giờ.",
    cta: "Xem bữa tối →",
    tone: "dinner" as const,
  },
  breakfast: {
    href: "/breakfast",
    kicker: "Sáng mai ăn gì?",
    title: "Sáng mai ăn gì?",
    copy: "Đặt tối nay · giao sáng sớm quanh nhà.",
    cta: "Xem quán nhận đơn →",
    tone: "breakfast" as const,
  },
} as const;
