import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { offerings } from "./catalog.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

export const beautyVisitIntents = pgTable("beauty_visit_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  customerUserId: uuid("customer_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "restrict" }),
  offeringId: uuid("offering_id").references(() => offerings.id, { onDelete: "set null" }),
  status: text("status").notNull().default("ACTIVE"),
  etaMinutes: integer("eta_minutes").notNull(),
  expectedAt: timestamp("expected_at", { withTimezone: true, mode: "date" }).notNull(),
  shopWaitingAt: timestamp("shop_waiting_at", { withTimezone: true, mode: "date" }),
  providerNote: text("provider_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const VISIT_INTENT_EXPIRE_BUFFER_MINUTES = 15;
