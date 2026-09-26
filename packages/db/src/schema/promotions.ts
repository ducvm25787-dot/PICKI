import { boolean, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

export const PROMOTION_KINDS = [
  "OPENING",
  "GIFT",
  "DISCOUNT",
  "NEW_ITEM",
  "HAPPY_HOUR",
  "FAMILIAR",
  "FLASH",
] as const;

export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const openingReminders = pgTable(
  "opening_reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [unique("opening_reminders_user_location_uidx").on(t.userId, t.providerLocationId)],
);

export const providerPromotions = pgTable("provider_promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  detail: text("detail"),
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
  spotlight: boolean("spotlight").notNull().default(false),
  createdAt: createdAt(),
});
