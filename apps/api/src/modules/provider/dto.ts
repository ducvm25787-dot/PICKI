import { z } from "zod";

export const providerOrderActionSchema = z
  .object({
    action: z.enum([
      "accept",
      "reject",
      "find_runner",
      "preparing",
      "ready",
      "handoff",
      "received",
      "collected",
      "processing",
      "ready_for_return",
      "find_return_runner",
      "cancel_return_runner",
      "cancel_find_runner",
      "staff_deliver",
      "customer_pickup",
      "complete",
    ]),
    rejectReason: z.string().trim().max(500).optional(),
  });

export const updateLiveStatusSchema = z.object({
  status: z.enum(["OPEN", "BUSY", "CLOSED", "OFFLINE"]),
  message: z.string().max(200).optional(),
  estimatedWaitMinutes: z.number().int().min(0).max(240).optional(),
});

export const updateProviderProfileSchema = z.object({
  tagline: z.string().trim().max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  logoUrl: z.string().max(500).optional(),
  coverUrl: z.string().max(500).optional(),
  addressLine: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const createDailyUpdateSchema = z.object({
  updateType: z.enum([
    "TODAY_AVAILABLE",
    "DAILY_SPECIAL",
    "NEW_ITEM",
    "OPEN_SLOT",
    "LOW_STOCK",
    "LATE_DINNER",
    "PROMOTION",
    "NEW_SERVICE",
  ]),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  ctaLabel: z.string().trim().max(40).optional(),
  imageUrls: z.array(z.string().min(1).max(500)).max(3).optional(),
  /** ISO datetime; default end of VN day */
  expiresAt: z.string().datetime().optional(),
});

export const updateDailyUpdateSchema = z.object({
  updateType: z
    .enum([
      "TODAY_AVAILABLE",
      "DAILY_SPECIAL",
      "NEW_ITEM",
      "OPEN_SLOT",
      "LOW_STOCK",
      "LATE_DINNER",
      "PROMOTION",
      "NEW_SERVICE",
    ])
    .optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  ctaLabel: z.string().trim().max(40).nullable().optional(),
  imageUrls: z.array(z.string().min(1).max(500)).max(3).optional(),
});

export const upsertLoyaltyProgramSchema = z
  .object({
    enabled: z.boolean(),
    regularThreshold: z.number().int().min(1).max(100).optional(),
    vipThreshold: z.number().int().min(2).max(500).optional(),
  })
  .superRefine((val, ctx) => {
    const reg = val.regularThreshold ?? 5;
    const vip = val.vipThreshold ?? 15;
    if (vip <= reg) {
      ctx.addIssue({
        code: "custom",
        message: "vipThreshold must be greater than regularThreshold",
        path: ["vipThreshold"],
      });
    }
  });

export const setOpensAtSchema = z.object({
  opensAt: z.string().min(8).nullable(),
});

export const createPromotionSchema = z.object({
  kind: z.enum([
    "OPENING",
    "GIFT",
    "DISCOUNT",
    "NEW_ITEM",
    "HAPPY_HOUR",
    "FAMILIAR",
    "FLASH",
  ]),
  title: z.string().trim().min(2).max(80),
  detail: z.string().trim().max(200).optional(),
  startsAt: z.string().min(8),
  endsAt: z.string().min(8),
  spotlight: z.boolean().optional(),
});

export const upsertLoyaltyBenefitSchema = z.object({
  tier: z.enum(["REGULAR", "VIP"]),
  benefitType: z.enum([
    "DISCOUNT_PERCENT",
    "FREE_ITEM",
    "FREE_DELIVERY",
    "PRIORITY_SLOT",
    "EARLY_ACCESS",
    "CUSTOM_TEXT",
  ]),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  customText: z.string().trim().max(200).optional(),
  active: z.boolean().optional(),
});
