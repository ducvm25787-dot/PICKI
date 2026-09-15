import { z } from "zod";

export const createServiceRequestSchema = z.object({
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  offeringId: z.string().uuid().optional(),
  customerNote: z.string().max(2000).optional(),
  preferredAt: z.string().datetime().optional(),
  deliveryBuilding: z.string().max(100).optional(),
  deliveryApartment: z.string().max(50).optional(),
  deliveryNote: z.string().max(500).optional(),
});

export const providerServiceRequestActionSchema = z.object({
  action: z.enum(["accept", "reject", "start", "complete"]),
  note: z.string().max(500).optional(),
});

export const scheduleEducationTrialSchema = z
  .object({
    scheduledAt: z.string().datetime(),
    locationType: z.enum(["OFFLINE", "ONLINE"]),
    offlineAddress: z.string().max(500).optional(),
    onlinePlatform: z.enum(["ZOOM", "GOOGLE_MEET", "OTHER"]).optional(),
    onlineDetail: z.string().max(500).optional(),
    teacherName: z.string().min(1).max(200),
  })
  .superRefine((val, ctx) => {
    if (val.locationType === "OFFLINE" && !val.offlineAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nhập địa điểm học offline",
        path: ["offlineAddress"],
      });
    }
    if (val.locationType === "ONLINE" && !val.onlinePlatform) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chọn nền tảng học online",
        path: ["onlinePlatform"],
      });
    }
    if (
      val.locationType === "ONLINE" &&
      val.onlinePlatform === "OTHER" &&
      !val.onlineDetail?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nhập tên nền tảng",
        path: ["onlineDetail"],
      });
    }
  });
