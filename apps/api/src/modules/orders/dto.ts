import { z } from "zod";

export const createOrderItemSchema = z.object({
  offeringId: z.string().uuid().optional(),
  menuItemId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(20),
  /** Family Dinner: Nấu sẵn (default) | Tự nấu — cùng giá */
  prepMode: z.enum(["READY_COOKED", "SELF_COOK"]).optional(),
  optionIds: z.array(z.string().uuid()).max(12).optional(),
});

const orderCheckoutFields = {
  providerLocationId: z.string().uuid(),
  zoneId: z.string().uuid(),
  deliveryHandoffMode: z.enum(["LOBBY_PICKUP", "DOOR_DELIVERY"]).default("LOBBY_PICKUP"),
  items: z.array(createOrderItemSchema).min(1).max(30),
  orderKind: z.enum(["STANDARD", "FAMILY_DINNER", "LATE_DINNER", "BREAKFAST_PREORDER"]).default("STANDARD"),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deliveryWindowId: z.string().uuid().optional(),
  lateDinnerOfferId: z.string().uuid().optional(),
};

function refineOrderCheckout(
  v: {
    orderKind: "STANDARD" | "FAMILY_DINNER" | "LATE_DINNER" | "BREAKFAST_PREORDER";
    items: { offeringId?: string; menuItemId?: string }[];
    lateDinnerOfferId?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (v.orderKind === "STANDARD") {
    for (const [i, item] of v.items.entries()) {
      if (!item.offeringId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "offeringId required",
          path: ["items", i, "offeringId"],
        });
      }
    }
  }
  if (v.orderKind === "FAMILY_DINNER" || v.orderKind === "BREAKFAST_PREORDER") {
    for (const [i, item] of v.items.entries()) {
      if (!item.menuItemId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "menuItemId required",
          path: ["items", i, "menuItemId"],
        });
      }
    }
  }
  if (v.orderKind === "LATE_DINNER" && !v.lateDinnerOfferId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "lateDinnerOfferId required",
      path: ["lateDinnerOfferId"],
    });
  }
}

export const orderCheckoutSchema = z.object(orderCheckoutFields).superRefine(refineOrderCheckout);

export const createOrderSchema = z
  .object({
    ...orderCheckoutFields,
    addressId: z.string().uuid(),
    laundryPickupMode: z.enum(["HOME_PICKUP", "SHOP_DROP_OFF", "ON_SITE"]).optional(),
    paymentMode: z.enum(["COD", "PAY_ON_PICKI", "PAY_ON_COMPLETION"]).default("COD"),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .superRefine(refineOrderCheckout);
