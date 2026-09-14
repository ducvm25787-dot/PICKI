import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name"),
  activeZoneId: uuid("active_zone_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userIdentities = pgTable("user_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  externalUserId: text("external_user_id").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  scopeType: text("scope_type"),
  scopeId: uuid("scope_id"),
  createdAt: createdAt(),
});

export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: createdAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
});

export const authOtpChallenges = pgTable("auth_otp_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: text("channel").notNull(),
  destination: text("destination").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});
