import { z } from "zod";

export const createVisitIntentSchema = z.object({
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  offeringId: z.string().uuid(),
  etaMinutes: z.number().int().min(5).max(240),
});

export const providerVisitIntentActionSchema = z
  .object({
    action: z.enum(["waiting", "arrived", "dismiss"]),
    reason: z.string().trim().min(2).max(300).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "dismiss" && !val.reason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nhập lý do từ chối",
        path: ["reason"],
      });
    }
  });
