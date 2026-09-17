import { z } from "zod";

const hhMm = z.string().regex(/^\d{2}:\d{2}$/);

export const publishBreakfastMenuSchema = z.object({
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  items: z
    .array(
      z
        .object({
          offeringId: z.string().uuid().optional(),
          name: z.string().trim().min(2).max(120).optional(),
          description: z.string().trim().max(500).optional(),
          priceVnd: z.number().int().min(0).optional(),
          capacity: z.number().int().min(1).max(500).optional(),
          sortOrder: z.number().int().min(0).max(100).optional(),
        })
        .refine(
          (v) => Boolean(v.offeringId) || (Boolean(v.name?.trim()) && v.priceVnd !== undefined),
          { message: "offeringId hoặc name+priceVnd bắt buộc" },
        ),
    )
    .min(1)
    .max(40),
  /** Giờ bắt đầu giao sáng — mặc định 06:00; server chia slot 15 phút tới deliveryEndAt */
  deliveryStartAt: hhMm.optional(),
  /** Giờ kết thúc giao sáng — mặc định 08:30 */
  deliveryEndAt: hhMm.optional(),
  capacityPerSlot: z.number().int().min(1).max(200).optional(),
  /** Override thủ công — nếu gửi thì dùng thay vì generate từ start/end */
  windows: z
    .array(
      z.object({
        startsAt: hhMm,
        endsAt: hhMm,
        capacity: z.number().int().min(1).max(200),
      }),
    )
    .min(1)
    .max(24)
    .optional(),
});

export const patchBreakfastSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  cutoffTime: hhMm.optional(),
  openFromTime: hhMm.optional(),
  dailyCapacity: z.number().int().min(1).max(5000).nullable().optional(),
});

export const patchBreakfastItemSchema = z.object({
  status: z.enum(["ACTIVE", "SOLD_OUT", "PAUSED"]),
});

export const copyLastBreakfastMenuSchema = z.object({
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  publish: z.boolean().optional().default(false),
});
