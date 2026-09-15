import { z } from "zod";

export const createOrderItemSchema = z.object({
  offeringId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20),
});

export const orderCheckoutSchema = z.object({
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  deliveryHandoffMode: z.enum(["LOBBY_PICKUP", "DOOR_DELIVERY"]).default("LOBBY_PICKUP"),
  items: z.array(createOrderItemSchema).min(1).max(30),
});

export const createOrderSchema = orderCheckoutSchema.extend({
  addressId: z.string().uuid(),
  laundryPickupMode: z.enum(["HOME_PICKUP", "SHOP_DROP_OFF", "ON_SITE"]).optional(),
  paymentMode: z.enum(["COD", "PAY_ON_PICKI", "PAY_ON_COMPLETION"]).default("COD"),
  idempotencyKey: z.string().min(8).max(128).optional(),
});
