import { z } from "zod";

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

export const verifyLocationPinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  addressLine: z.string().max(300).optional(),
  note: z.string().max(500).optional(),
  verified: z.boolean().default(true),
});
