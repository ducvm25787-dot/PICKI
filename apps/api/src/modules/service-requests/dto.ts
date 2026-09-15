import { z } from "zod";

export const createServiceRequestSchema = z.object({
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  offeringId: z.string().uuid().optional(),
  customerNote: z.string().max(2000).optional(),
  preferredAt: z.string().datetime().optional(),
  deliveryBuilding: z.string().max(100).optional(),
  deliveryApartment: z.string().max(50).optional(),
  deliveryNote: z.string().max(500).optional(),
});

export const providerServiceRequestActionSchema = z.object({
  action: z.enum(["accept", "reject", "start", "complete"]),
  note: z.string().max(500).optional(),
});
