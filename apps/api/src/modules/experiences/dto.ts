import { z } from "zod";
import {
  EXPERIENCE_AUDIENCES,
  EXPERIENCE_CATEGORIES,
  EXPERIENCE_MEDIA_STATUSES,
  EXPERIENCE_PRICE_MODES,
} from "@picki/db";

export const experiencePatchSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  summary: z.string().trim().min(1).max(500).optional(),
  whyGo: z.string().trim().min(1).max(800).optional(),
  body: z.string().max(8000).nullable().optional(),
  priceMode: z.enum(EXPERIENCE_PRICE_MODES).optional(),
  priceFrom: z.number().int().nullable().optional(),
  priceTo: z.number().int().nullable().optional(),
  priceNote: z.string().trim().max(300).nullable().optional(),
  ageNote: z.string().trim().max(200).nullable().optional(),
  language: z.string().trim().max(40).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  categories: z.array(z.enum(EXPERIENCE_CATEGORIES)).min(1).optional(),
  audiences: z.array(z.enum(EXPERIENCE_AUDIENCES)).min(1).optional(),
  bookingUrl: z.string().trim().url().nullable().optional(),
  coverUrl: z
    .string()
    .trim()
    .refine(
      (value) =>
        value.startsWith("/v1/uploads/experiences/") || /^https?:\/\//.test(value),
      "Ảnh phải là link http hoặc ảnh đã tải lên",
    )
    .nullable()
    .optional(),
  mediaStatus: z.enum(EXPERIENCE_MEDIA_STATUSES).optional(),
  soldOut: z.boolean().optional(),
  featuredRank: z.number().int().min(1).max(99).nullable().optional(),
  bookingDeadline: z.string().datetime({ offset: true }).nullable().optional(),
  registrationDeadline: z.string().datetime({ offset: true }).nullable().optional(),
  organizerName: z.string().trim().min(1).max(160).optional(),
  organizerWebsiteUrl: z.string().trim().url().nullable().optional(),
  venueName: z.string().trim().min(1).max(160).optional(),
  venueAddress: z.string().trim().max(240).nullable().optional(),
  venueLat: z.number().min(-90).max(90).nullable().optional(),
  venueLng: z.number().min(-180).max(180).nullable().optional(),
  occurrences: z
    .array(
      z.object({
        startAt: z.string().min(1),
        endAt: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .optional(),
});

export const importCommitSchema = z.object({
  items: z
    .array(
      z.object({
        decision: z.enum(["skip", "import", "import_anyway", "attach_source"]),
        experience: z.any(),
      }),
    )
    .min(1)
    .max(40),
});

export const importPreviewSchema = z.object({
  items: z.array(z.unknown()).min(1).max(40),
});

export const experienceSubmissionSchema = z.object({
  organizerName: z.string().trim().min(1).max(160),
  websiteUrl: z.string().trim().url().nullable().optional(),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(500),
  whyGo: z.string().trim().min(1).max(800),
  body: z.string().max(8000).optional(),
  venueName: z.string().trim().min(1).max(160),
  venueAddress: z.string().trim().max(240).nullable().optional(),
  startAt: z.string().min(1),
  endAt: z.string().nullable().optional(),
  priceMode: z.enum(EXPERIENCE_PRICE_MODES),
  priceFrom: z.number().int().nullable().optional(),
  priceTo: z.number().int().nullable().optional(),
  priceNote: z.string().trim().max(300).nullable().optional(),
  categories: z.array(z.enum(EXPERIENCE_CATEGORIES)).min(1),
  audiences: z.array(z.enum(EXPERIENCE_AUDIENCES)).min(1),
  bookingUrl: z.string().trim().url().nullable().optional(),
  imageUrls: z.array(z.string().max(300)).max(6).optional(),
});
