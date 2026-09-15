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
      "staff_deliver",
      "complete",
    ]),
    rejectReason: z.string().min(1).max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.action === "reject" && !val.rejectReason?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "rejectReason is required when rejecting",
        path: ["rejectReason"],
      });
    }
  });

export const updateLiveStatusSchema = z.object({
  status: z.enum(["OPEN", "BUSY", "CLOSED", "OFFLINE"]),
  message: z.string().max(200).optional(),
  estimatedWaitMinutes: z.number().int().min(0).max(240).optional(),
});
