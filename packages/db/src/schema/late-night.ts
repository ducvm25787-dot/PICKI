import { boolean, pgTable, time, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { providerLocations } from "./providers.js";

export const lateNightProviderSettings = pgTable("late_night_provider_settings", {
  providerLocationId: uuid("provider_location_id")
    .primaryKey()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  /** Default 20:30 — when late-night discovery may start. */
  startsAt: time("starts_at").notNull().default("20:30"),
  /** Default 02:00 — overnight end OK when ends_at < starts_at. */
  endsAt: time("ends_at").notNull().default("02:00"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
