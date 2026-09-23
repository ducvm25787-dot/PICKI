/** Habit-First Context Now — configurable windows (pilot VN local clock). */

export type ContextWindowId =
  | "morning"
  | "day"
  | "homecoming"
  | "evening"
  | "late-dinner"
  | "weekend"
  | "breakfast-preorder"
  | "family-dinner";

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

/** First match wins. Copy = benefit language only. */
const DEFAULT_RULES: WindowRule[] = [
  {
    id: "breakfast-preorder",
    startHour: 20,
    endHour: 21,
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
    id: "late-dinner",
    startHour: 21,
    endHour: 23,
    content: {
      kicker: "Bữa tối muộn",
      title: "Ăn tối muộn quanh bạn",
      copy: "Quán còn mở · tiện ích đêm trong Zone.",
      cta: "Xem đang mở →",
      href: "/late-night",
      tone: "evening",
    },
  },
  {
    id: "breakfast-preorder",
    startHour: 23,
    endHour: 24,
    content: {
      kicker: "Sáng mai ăn gì?",
      title: "Sáng mai ăn gì?",
      copy: "Đặt trước khi ngủ · giao sáng sớm quanh nhà.",
      cta: "Xem quán nhận đơn →",
      href: "/breakfast",
      tone: "breakfast",
    },
  },
  {
    id: "weekend",
    startHour: 8,
    endHour: 18,
    days: [0, 6],
    content: {
      kicker: "Cuối tuần quanh nhà",
      title: "Cuối tuần quanh nhà mình?",
      copy: "Ăn uống · làm đẹp · mua sắm · khám phá Zone.",
      cta: "Khám phá quanh nhà →",
      href: "/family-dinner",
      tone: "weekend",
    },
  },
  {
    id: "homecoming",
    startHour: 15,
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
    id: "evening",
    startHour: 18,
    endHour: 21,
    content: {
      kicker: "Tối nay quanh bạn",
      title: "Ăn tối · mua nhanh · làm đẹp",
      copy: "Chỗ đang mở quanh nhà lúc này.",
      cta: "Xem quanh nhà →",
      href: "/family-dinner",
      tone: "evening",
    },
  },
  {
    id: "morning",
    startHour: 5,
    endHour: 11,
    content: {
      kicker: "Chào buổi sáng",
      title: "Ăn sáng quanh bạn",
      copy: "Phở · bánh mì · mua nhanh trước khi đi làm.",
      cta: "Xem quanh nhà →",
      href: "/zones/kim-van-kim-lu/browse/food",
      tone: "day",
    },
  },
  {
    id: "family-dinner",
    startHour: 11,
    endHour: 15,
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
    id: "family-dinner",
    startHour: 0,
    endHour: 24,
    content: {
      kicker: "Bữa tối ấm cúng",
      title: "Tối nay nhà mình ăn gì?",
      copy: "Cơm nhà vừa nấu · giao đúng giờ.",
      cta: "Xem bữa tối →",
      href: "/family-dinner",
      tone: "dinner",
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
  const fallback = DEFAULT_RULES[DEFAULT_RULES.length - 1]!;
  return { id: fallback.id, ...fallback.content };
}

export type HomeHeroSlot = "family-dinner" | "breakfast";

export function homeHeroSlot(now: Date = new Date()): HomeHeroSlot {
  return now.getHours() >= 20 ? "breakfast" : "family-dinner";
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
