import { z } from "zod";

export const providerOrderActionSchema = z.object({
  action: z.enum([
    "accept",
    "reject",
    "find_runner",
    "preparing",
    "ready",
    "handoff",
    "received",
    "processing",
    "ready_for_return",
    "find_return_runner",
  ]),
});

export const updateLiveStatusSchema = z.object({
  status: z.enum(["OPEN", "BUSY", "CLOSED", "OFFLINE"]),
  message: z.string().max(200).optional(),
});
