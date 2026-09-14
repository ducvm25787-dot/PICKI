import { doublePrecision, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { addresses } from "./addresses.js";
import { offerings } from "./catalog.js";
import { users } from "./identity.js";
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
  paymentMode: text("payment_mode").notNull().default("COD"),
  subtotalVnd: integer("subtotal_vnd").notNull(),
  deliveryFeeVnd: integer("delivery_fee_vnd").notNull().default(0),
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
  deliveryLat: doublePrecision("delivery_lat"),
  deliveryLng: doublePrecision("delivery_lng"),
  idempotencyKey: text("idempotency_key").unique(),
  runnerUserId: uuid("runner_user_id").references(() => users.id, { onDelete: "set null" }),
  estimatedReadyAt: timestamp("estimated_ready_at", { withTimezone: true, mode: "date" }),
  providerHandoffAt: timestamp("provider_handoff_at", { withTimezone: true, mode: "date" }),
  runnerSoughtAt: timestamp("runner_sought_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  description: text("description"),
  unitPriceVnd: integer("unit_price_vnd").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotalVnd: integer("line_total_vnd").notNull(),
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
