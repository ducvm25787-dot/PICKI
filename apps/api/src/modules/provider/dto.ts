import { z } from "zod";

export const providerOrderActionSchema = z.object({
  action: z.enum(["accept", "reject", "preparing", "ready", "handoff"]),
});

export const updateLiveStatusSchema = z.object({
  status: z.enum(["OPEN", "BUSY", "CLOSED", "OFFLINE"]),
  message: z.string().max(200).optional(),
});
