import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { offerings } from "./catalog.js";
import { providerLocations } from "./providers.js";
import { zones } from "./zones.js";

export const serviceRequests = pgTable("service_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestNumber: text("request_number").notNull().unique(),
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
  status: text("status").notNull().default("OPEN"),
  customerNote: text("customer_note"),
  providerNote: text("provider_note"),
  preferredAt: timestamp("preferred_at", { withTimezone: true, mode: "date" }),
  trialScheduledAt: timestamp("trial_scheduled_at", { withTimezone: true, mode: "date" }),
  trialLocationType: text("trial_location_type"),
  trialLocationDetail: text("trial_location_detail"),
  trialOnlinePlatform: text("trial_online_platform"),
  trialTeacherName: text("trial_teacher_name"),
  deliveryBuilding: text("delivery_building"),
  deliveryApartment: text("delivery_apartment"),
  deliveryNote: text("delivery_note"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
