import { z } from "zod";

export const phoneOtpRequestSchema = z.object({
  phone: z.string().min(8).max(20),
});

export const pickiAppRoleSchema = z.enum(["customer", "provider", "runner", "admin"]);

export const phoneOtpVerifySchema = z.object({
  phone: z.string().min(8).max(20),
  code: z.string().regex(/^\d{6}$/),
  app: pickiAppRoleSchema.optional(),
});

export const emailOtpRequestSchema = z.object({
  email: z.string().email(),
});

export const emailOtpVerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

export const patchMeSchema = z.object({
  displayName: z.string().min(1).max(120).nullable().optional(),
  activeZoneId: z.string().uuid().nullable().optional(),
});

export const avatarUploadSchema = z.object({
  dataUrl: z.string().min(32).max(450_000),
});
