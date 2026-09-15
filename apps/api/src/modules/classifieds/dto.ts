import { z } from "zod";

export const createClassifiedSchema = z.object({
  zoneId: z.string().uuid(),
  listingType: z.enum(["RESALE", "GIVE_AWAY"]),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  priceVnd: z.number().int().min(0).optional(),
  condition: z.enum(["NEW", "LIKE_NEW", "GOOD", "FAIR"]).optional(),
  photoUrls: z.array(z.string().max(500)).max(3).optional(),
  locationLabel: z.string().trim().min(2).max(120),
});

export const uploadClassifiedPhotoSchema = z.object({
  dataUrl: z.string().min(32).max(450_000),
});

export const listClassifiedsQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  listingType: z.enum(["RESALE", "GIVE_AWAY"]).optional(),
  status: z.enum(["AVAILABLE", "RESERVED", "COMPLETED", "GIVEN"]).optional(),
});
