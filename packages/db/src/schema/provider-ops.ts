import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations, providers } from "./providers.js";

export const providerMembers = pgTable("provider_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id")
    .notNull()
    .references(() => providers.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id").references(() => providerLocations.id, {
    onDelete: "cascade",
  }),
  role: text("role").notNull().default("STAFF"),
  createdAt: createdAt(),
});
