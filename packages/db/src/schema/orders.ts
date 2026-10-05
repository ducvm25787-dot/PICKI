import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uuid, date } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { addresses } from "./addresses.js";
import { offerings } from "./catalog.js";
import {
  breakfastPreorderDeliveryWindows,
  breakfastPreorderMenuItems,
} from "./breakfast-preorder.js";
import { familyDinnerDeliveryWindows, familyDinnerMenuItems } from "./family-dinner.js";
import { scheduledDeliveryWindows } from "./scheduled-fulfillment.js";
import { users } from "./identity.js";
import { marketBaskets } from "./market.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  customerUserId: uuid("customer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("CREATED"),
  serviceVertical: text("service_vertical").notNull().default("FOOD"),
  orderKind: text("order_kind").notNull().default("STANDARD"),
  serviceDate: date("service_date"),
  deliveryWindowId: uuid("delivery_window_id").references(() => familyDinnerDeliveryWindows.id, {
    onDelete: "set null",
  }),
  /**
   * Compatibility name. FK into breakfast_preorder_delivery_windows, which holds
   * both BREAKFAST and LUNCH slots. Lunch orders use this column too.
   */
  breakfastDeliveryWindowId: uuid("breakfast_delivery_window_id").references(
    () => breakfastPreorderDeliveryWindows.id,
    { onDelete: "set null" },
  ),
  /** Generic slot. V1 MARKET_MORNING. Not a breakfast or dinner window. */
  scheduledDeliveryWindowId: uuid("scheduled_delivery_window_id").references(
    () => scheduledDeliveryWindows.id,
    { onDelete: "set null" },
  ),
  lateDinnerOfferId: uuid("late_dinner_offer_id"),
  productionLockedAt: timestamp("production_locked_at", { withTimezone: true, mode: "date" }),
  laundryPickupMode: text("laundry_pickup_mode"),
  paymentMode: text("payment_mode").notNull().default("COD"),
  /** Snapshot at create time. Later edits to the offering do not clear this. */
  containsAlcohol: boolean("contains_alcohol").notNull().default(false),
  recipientName: text("recipient_name"),
  recipientAgeConfirmed: boolean("recipient_age_confirmed").notNull().default(false),
  /** Text in the database. Services must validate with parseOrderCancelReason. */
  cancelReason: text("cancel_reason"),
  subtotalVnd: integer("subtotal_vnd").notNull(),
  /** Compatibility mirror of customer_delivery_fee. Not runner payout. */
  deliveryFeeVnd: integer("delivery_fee_vnd").notNull().default(0),
  fulfillmentMode: text("fulfillment_mode").notNull().default("PICKEE_RUNNER"),
  deliveryFeeBase: integer("delivery_fee_base").notNull().default(0),
  customerDeliveryFee: integer("customer_delivery_fee").notNull().default(0),
  providerDeliverySubsidy: integer("provider_delivery_subsidy").notNull().default(0),
  pickeeDeliverySubsidy: integer("pickee_delivery_subsidy").notNull().default(0),
  runnerPayable: integer("runner_payable").notNull().default(0),
  deliveryPromotionId: uuid("delivery_promotion_id"),
  providerDeliveryEarning: integer("provider_delivery_earning").notNull().default(0),
  runnerSearchCancelledAt: timestamp("runner_search_cancelled_at", {
    withTimezone: true,
    mode: "date",
  }),
  totalVnd: integer("total_vnd").notNull(),
  deliveryAddressId: uuid("delivery_address_id").references(() => addresses.id, {
    onDelete: "set null",
  }),
  deliveryAddressType: text("delivery_address_type").notNull().default("RESIDENTIAL"),
  deliveryHandoffMode: text("delivery_handoff_mode").notNull().default("LOBBY_PICKUP"),
  deliveryBuilding: text("delivery_building"),
  deliveryHouseNumber: text("delivery_house_number"),
  deliveryAlley: text("delivery_alley"),
  deliveryStreet: text("delivery_street"),
  deliveryWard: text("delivery_ward"),
  deliveryCity: text("delivery_city"),
  deliveryFloor: text("delivery_floor"),
  deliveryApartment: text("delivery_apartment"),
  deliveryNote: text("delivery_note"),
  runnerWaitMinutes: integer("runner_wait_minutes").notNull().default(0),
  runnerWaitFeeVnd: integer("runner_wait_fee_vnd").notNull().default(0),
  deliveryAccessNote: text("delivery_access_note"),
  deliveryPricingSnapshot: jsonb("delivery_pricing_snapshot"),
  commercialFulfillmentStatus: text("commercial_fulfillment_status").notNull().default("NOT_FULFILLED"),
  financialSnapshot: jsonb("financial_snapshot"),
  /** Message from the customer to the shop. Separate from the address delivery note. */
  customerNote: text("customer_note"),
  deliveryLat: doublePrecision("delivery_lat"),
  deliveryLng: doublePrecision("delivery_lng"),
  idempotencyKey: text("idempotency_key").unique(),
  runnerUserId: uuid("runner_user_id").references(() => users.id, { onDelete: "set null" }),
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true, mode: "date" }),
  providerHandoffAt: timestamp("provider_handoff_at", { withTimezone: true, mode: "date" }),
  runnerSoughtAt: timestamp("runner_sought_at", { withTimezone: true, mode: "date" }),
  runnerOfferWave: integer("runner_offer_wave").notNull().default(0),
  /** UNSPECIFIED = legacy checkout. DIRECT and MARKET_TRIP are written by the entry, never inferred. */
  commerceContext: text("commerce_context").notNull().default("UNSPECIFIED"),
  marketBasketId: uuid("market_basket_id").references(() => marketBaskets.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
},
(t) => [
  index("orders_market_basket_idx")
    .on(t.marketBasketId)
    .where(sql`${t.marketBasketId} IS NOT NULL`),
],
);

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
  familyDinnerMenuItemId: uuid("family_dinner_menu_item_id").references(
    () => familyDinnerMenuItems.id,
    { onDelete: "set null" },
  ),
  /**
   * Compatibility name. Menu line for BREAKFAST_PREORDER and LUNCH.
   * Daypart lives on the parent daily menu, not on the order item.
   */
  breakfastMenuItemId: uuid("breakfast_menu_item_id").references(
    () => breakfastPreorderMenuItems.id,
    { onDelete: "set null" },
  ),
  familyDinnerCategory: text("family_dinner_category"),
  /** READY_COOKED | SELF_COOK — Family Dinner; null = món thường / mặc định nấu sẵn */
  prepMode: text("prep_mode"),
  recipeVersionId: uuid("recipe_version_id"),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  unitPriceVnd: integer("unit_price_vnd").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalVnd: integer("line_total_vnd").notNull(),
  estimatedDays: integer("estimated_days"),
  optionSnapshot: jsonb("option_snapshot").$type<
    { optionId: string; groupName: string; name: string; priceDeltaVnd: number }[]
  >(),
  createdAt: createdAt(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: createdAt(),
});
