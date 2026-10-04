import { boolean, date, integer, jsonb, pgTable, text, time, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { providerLocations } from "./providers.js";

/** Generic delivery slot. V1 rows use purpose MARKET_MORNING. */
export const scheduledDeliveryWindows = pgTable(
  "scheduled_delivery_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    serviceDate: date("service_date").notNull(),
    startsAt: time("starts_at").notNull(),
    endsAt: time("ends_at").notNull(),
    capacity: integer("capacity"),
    remainingCapacity: integer("remaining_capacity"),
    purpose: text("purpose").notNull(),
    status: text("status").notNull().default("OPEN"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("scheduled_windows_slot_uidx").on(
      t.providerLocationId,
      t.serviceDate,
      t.purpose,
      t.startsAt,
      t.endsAt,
    ),
  ],
);

/** Per location. Cutoff and prepare lead are stored here, not in domain code. */
export const scheduledFulfillmentSettings = pgTable(
  "scheduled_fulfillment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerLocationId: uuid("provider_location_id")
      .notNull()
      .references(() => providerLocations.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    cutoffTime: time("cutoff_time").notNull(),
    prepareLeadMinutes: integer("prepare_lead_minutes").notNull(),
    slots: jsonb("slots").$type<{ startsAt: string; endsAt: string }[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("scheduled_fulfillment_location_purpose_uidx").on(t.providerLocationId, t.purpose),
  ],
);
