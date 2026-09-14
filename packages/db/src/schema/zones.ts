import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { multiPolygon4326 } from "../geometry.js";
import { users } from "./identity.js";

export const zoneCandidates = pgTable("zone_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("CANDIDATE"),
  anchorLng: doublePrecision("anchor_lng").notNull(),
  anchorLat: doublePrecision("anchor_lat").notNull(),
  proposedBoundary: multiPolygon4326("proposed_boundary"),
  scores: jsonb("scores").notNull().default({}),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const zones = pgTable("zones", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("DRAFT"),
  anchorLng: doublePrecision("anchor_lng").notNull(),
  anchorLat: doublePrecision("anchor_lat").notNull(),
  candidateId: uuid("candidate_id").references(() => zoneCandidates.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const zoneBoundaryVersions = pgTable("zone_boundary_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  boundary: multiPolygon4326("boundary").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  validTo: timestamp("valid_to", { withTimezone: true, mode: "date" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  changeReason: text("change_reason"),
  createdAt: createdAt(),
});

export const zoneSettings = pgTable("zone_settings", {
  zoneId: uuid("zone_id")
    .primaryKey()
    .references(() => zones.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: updatedAt(),
});

export const serviceAreas = pgTable("service_areas", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id")
    .notNull()
    .references(() => zones.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  boundary: multiPolygon4326("boundary").notNull(),
  createdAt: createdAt(),
});
