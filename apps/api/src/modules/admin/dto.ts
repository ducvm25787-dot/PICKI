import { z } from "zod";

export const HOME_HERO_CONTEXTS = [
  "breakfast-morning",
  "lunch",
  "family-dinner",
  "breakfast-preorder",
  "overnight",
] as const;

export const homeHeroImageSchema = z.object({
  contextId: z.enum(HOME_HERO_CONTEXTS),
  dataUrl: z.string().min(32).max(450_000),
});

export const saveHomeHeroSchema = z.object({
  contextId: z.enum(HOME_HERO_CONTEXTS),
  slots: z
    .array(
      z.union([
        z.object({ id: z.string().uuid() }),
        z.object({ dataUrl: z.string().min(32).max(450_000) }),
      ]),
    )
    .max(5),
});

export const adminOrderActionSchema = z.object({
  action: z.enum(["cancel"]),
  reason: z.string().max(500).optional(),
});

const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Closed or open ring — server closes it. Min 3 vertices. */
export const polygonRingSchema = z.array(latLngSchema).min(3).max(200);

export const publishBoundarySchema = z.object({
  ring: polygonRingSchema,
  changeReason: z.string().min(3).max(500),
});

export const upsertServiceAreaSchema = z.object({
  kind: z.enum(["CORE", "PRIMARY", "EXTENDED"]),
  ring: polygonRingSchema,
});

export const updateAnchorSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const createDeliveryPromotionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  sponsorType: z.enum(["PROVIDER", "PICKEE", "SHARED"]),
  subsidyMode: z.enum(["COVER_UP_TO", "SHARED_AMOUNTS"]),
  zoneId: z.string().uuid(),
  providerId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minimumOrderVnd: z.number().int().min(0).default(0),
  maxSubsidyPerOrderVnd: z.number().int().min(0).max(5_000_000),
  providerShareVnd: z.number().int().min(0).default(0),
  pickeeShareVnd: z.number().int().min(0).default(0),
  usageLimitTotal: z.number().int().min(1).nullable().optional(),
  usageLimitPerUser: z.number().int().min(1).nullable().optional(),
  usageLimitPerUserPerDay: z.number().int().min(1).nullable().optional(),
  budgetVnd: z.number().int().min(0).nullable().optional(),
  eligibleModes: z
    .array(z.enum(["PICKEE_RUNNER", "PROVIDER_SELF_DELIVERY", "CUSTOMER_PICKUP"]))
    .min(1)
    .default(["PICKEE_RUNNER"]),
});

export const setLocationVerificationSchema = z.object({
  status: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]),
  note: z.string().max(500).optional(),
});

export const issueLocationQrSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const upsertZonePlaceSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["BUILDING", "AREA"]),
  code: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(80),
  elevatorNote: z.string().trim().max(300).nullable().optional(),
  accessCardRequired: z.boolean(),
  securityNote: z.string().trim().max(300).nullable().optional(),
  callUpRequired: z.boolean(),
  doorDeliveryAllowed: z.boolean(),
  lobbyWaitMinutes: z.number().int().min(0).max(180),
  doorWaitMinutes: z.number().int().min(0).max(180),
  runnerFeePerMinuteVnd: z.number().int().min(0).max(100_000),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const verifyLocationPinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressLine: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
  verified: z.boolean().default(true),
});
