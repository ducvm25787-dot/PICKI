import { z } from "zod";

export const discoverSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const joinZoneSchema = z
  .object({
    addressType: z.enum([
      "RESIDENTIAL",
      "WORKPLACE",
      "STREET_ADDRESS",
      "TEMPORARY",
      "OTHER",
    ]),
    label: z.enum(["HOME", "WORK", "OTHER"]).default("HOME"),
    building: z.string().min(1).max(120).optional(),
    floor: z.string().max(20).optional(),
    apartment: z.string().max(20).optional(),
    houseNumber: z.string().max(40).optional(),
    alley: z.string().max(120).optional(),
    street: z.string().max(120).optional(),
    ward: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    deliveryNote: z.string().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.addressType === "RESIDENTIAL" || data.addressType === "WORKPLACE") {
      if (!data.building?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "building is required for apartment addresses",
          path: ["building"],
        });
      }
      if (!data.apartment?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "apartment is required for apartment addresses",
          path: ["apartment"],
        });
      }
    }
    if (data.addressType === "STREET_ADDRESS") {
      if (!data.street?.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "street is required for street addresses",
          path: ["street"],
        });
      }
    }
  });

export const joinZoneBodySchema = discoverSchema.and(joinZoneSchema);
