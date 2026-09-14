import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./helpers.js";
import { users } from "./identity.js";
import { offerings } from "./catalog.js";
import { orders } from "./orders.js";
import { providerLocations } from "./providers.js";

export const dailySpecials = pgTable("daily_specials", {
  id: uuid("id").primaryKey().defaultRandom(),
  offeringId: uuid("offering_id")
    .notNull()
    .references(() => offerings.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  availableDate: date("available_date").notNull(),
  quantityTotal: integer("quantity_total").notNull(),
  quantityRemaining: integer("quantity_remaining").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const locationReviews = pgTable("location_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  customerUserId: uuid("customer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: createdAt(),
});

export const userFavorites = pgTable("user_favorites", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});
