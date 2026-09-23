import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/** Append-only product analytics — Habit-First S-H7 (ADR-054). */
export const analyticsEvents = pgTable("analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventName: text("event_name").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  zoneId: uuid("zone_id"),
  properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
