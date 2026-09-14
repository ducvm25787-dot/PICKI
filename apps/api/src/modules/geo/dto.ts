import { z } from "zod";

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const distanceSchema = z.object({
  from: latLngSchema,
  to: latLngSchema,
});

export const containsSchema = z.object({
  geometryWkt: z.string().min(10),
  point: latLngSchema,
});

export const geocodeSchema = z.object({
  query: z.string().min(2).max(500),
});

export const reverseGeocodeSchema = latLngSchema;

export const etaSchema = distanceSchema;
