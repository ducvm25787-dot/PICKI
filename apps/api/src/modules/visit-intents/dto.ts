import { z } from "zod";

export const createVisitIntentSchema = z.object({
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  offeringId: z.string().uuid(),
  etaMinutes: z.number().int().min(5).max(240),
});

export const providerVisitIntentActionSchema = z.object({
  action: z.enum(["arrived", "dismiss"]),
});
