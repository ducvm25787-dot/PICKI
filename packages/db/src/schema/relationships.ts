import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";
import { providerLocations } from "./providers.js";

/** Habit-First: deterministic familiarity (user × location). Favorite sync optional. */
export const userProviderRelationships = pgTable("user_provider_relationships", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  providerLocationId: uuid("provider_location_id")
    .notNull()
    .references(() => providerLocations.id, { onDelete: "cascade" }),
  favorite: boolean("favorite").notNull().default(false),
  completedInteractions: integer("completed_interactions").notNull().default(0),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true, mode: "date" }),
  relationshipScore: integer("relationship_score").notNull().default(0),
  relationshipStatus: text("relationship_status").notNull().default("NEW"),
  hiddenByUser: boolean("hidden_by_user").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
