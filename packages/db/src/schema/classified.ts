import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { zones } from "./zones.js";

export const classifiedListings = pgTable("classified_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingNumber: text("listing_number").notNull().unique(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  sellerUserId: uuid("seller_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  listingType: text("listing_type").notNull(),
  status: text("status").notNull().default("AVAILABLE"),
  title: text("title").notNull(),
  description: text("description"),
  priceVnd: integer("price_vnd"),
  condition: text("condition"),
  photoUrl: text("photo_url"),
  photoUrls: jsonb("photo_urls").notNull().default([]),
  locationLabel: text("location_label").notNull(),
  reservedByUserId: uuid("reserved_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classifiedReservations = pgTable("classified_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  listingId: uuid("listing_id")
    .notNull()
    .references(() => classifiedListings.id, { onDelete: "cascade" }),
  buyerUserId: uuid("buyer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
