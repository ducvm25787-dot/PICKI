import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { point4326 } from "../geometry.js";
import { users } from "./identity.js";
import { zones } from "./zones.js";

export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  addressType: text("address_type").notNull(),
  building: text("building"),
  floor: text("floor"),
  apartment: text("apartment"),
  houseNumber: text("house_number"),
  alley: text("alley"),
  street: text("street"),
  ward: text("ward"),
  city: text("city"),
  deliveryNote: text("delivery_note"),
  coordinates: point4326("coordinates"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userAddresses = pgTable("user_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  addressId: uuid("address_id")
    .notNull()
    .references(() => addresses.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("HOME"),
  createdAt: createdAt(),
});

export const addressVerifications = pgTable("address_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  addressId: uuid("address_id")
    .notNull()
    .references(() => addresses.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});

export const userZoneMemberships = pgTable("user_zone_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("JOINED"),
  defaultAddressId: uuid("default_address_id").references(() => addresses.id, {
    onDelete: "set null",
  }),
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  leftAt: timestamp("left_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
