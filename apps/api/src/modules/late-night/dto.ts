import { z } from "zod";

const hhMm = z.string().regex(/^\d{2}:\d{2}$/);

export const patchLateNightSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  startsAt: hhMm.optional(),
  endsAt: hhMm.optional(),
});
