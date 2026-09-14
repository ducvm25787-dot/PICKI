import { doublePrecision, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { orders } from "./orders.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("PENDING"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const deliveryRoutes = pgTable("delivery_routes", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  runnerUserId: uuid("runner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("PLANNED"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const routeOrders = pgTable("route_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => deliveryRoutes.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  deliveryId: uuid("delivery_id")
    .notNull()
    .references(() => deliveries.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const routeStops = pgTable("route_stops", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => deliveryRoutes.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  stopType: text("stop_type").notNull(),
  status: text("status").notNull().default("PENDING"),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, {
    onDelete: "set null",
  }),
  building: text("building"),
  floor: text("floor"),
  apartment: text("apartment"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  label: text("label"),
  pickiPointId: uuid("picki_point_id"),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const pickiPoints = pgTable("picki_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  building: text("building").notNull(),
  name: text("name").notNull(),
  pointType: text("point_type").notNull().default("LOBBY"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const zoneFulfillmentSettings = pgTable("zone_fulfillment_settings", {
  zoneId: uuid("zone_id")
    .primaryKey()
    .references(() => zones.id, { onDelete: "cascade" }),
  batchWaitWindowMinutes: integer("batch_wait_window_minutes").notNull().default(5),
  maxBatchOrders: integer("max_batch_orders").notNull().default(3),
  maxRouteDetourMeters: integer("max_route_detour_meters").notNull().default(500),
  updatedAt: updatedAt(),
});

export const lobbyHandoffs = pgTable("lobby_handoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeStopId: uuid("route_stop_id")
    .notNull()
    .references(() => routeStops.id, { onDelete: "cascade" }),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  pickiPointId: uuid("picki_point_id"),
  customerStatus: text("customer_status").notNull().default("WAITING"),
  runnerArrivedAt: timestamp("runner_arrived_at", { withTimezone: true }),
  customerUpdatedAt: timestamp("customer_updated_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdAt: createdAt(),
});
