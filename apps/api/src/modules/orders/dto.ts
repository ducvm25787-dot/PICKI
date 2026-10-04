import { z } from "zod";
import { isDaypartMenuOrder } from "@picki/shared";

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
  deliveryHandoffMode: z.enum(["LOBBY_PICKUP", "DOOR_DELIVERY"]).default("DOOR_DELIVERY"),
  items: z.array(createOrderItemSchema).min(1).max(30),
  orderKind: z.enum(["STANDARD", "FAMILY_DINNER", "LATE_DINNER", "BREAKFAST_PREORDER", "LUNCH"]).default("STANDARD"),
  serviceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  deliveryWindowId: z.string().uuid().optional(),
  scheduledDeliveryWindowId: z.string().uuid().optional(),
  lateDinnerOfferId: z.string().uuid().optional(),
  addressId: z.string().uuid().optional(),
};

function refineOrderCheckout(
  v: {
    orderKind: "STANDARD" | "FAMILY_DINNER" | "LATE_DINNER" | "BREAKFAST_PREORDER" | "LUNCH";
    items: { offeringId?: string; menuItemId?: string }[];
    lateDinnerOfferId?: string;
    scheduledDeliveryWindowId?: string;
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
  if (v.orderKind === "FAMILY_DINNER" || isDaypartMenuOrder(v.orderKind)) {
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
  if (v.scheduledDeliveryWindowId && v.orderKind !== "STANDARD") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sáng mai giao dùng đơn thường",
      path: ["orderKind"],
    });
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
    customerNote: z.string().trim().max(300).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    presenceLat: z.number().min(-90).max(90).optional(),
    presenceLng: z.number().min(-180).max(180).optional(),
    confirmHomeDelivery: z.boolean().optional(),
    recipientName: z.string().trim().min(2).max(80).optional(),
    recipientAgeConfirmed: z.boolean().optional(),
  })
  .superRefine(refineOrderCheckout);
