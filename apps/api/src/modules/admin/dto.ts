import { z } from "zod";

export const adminOrderActionSchema = z.object({
  action: z.enum(["cancel"]),
  reason: z.string().max(500).optional(),
});
