import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./helpers.js";
import { users } from "./identity.js";

export const EXPERIENCE_STATUSES = [
  "DRAFT",
  "PENDING",
  "PUBLISHED",
  "REJECTED",
  "EXPIRED",
] as const;
export type ExperienceStatus = (typeof EXPERIENCE_STATUSES)[number];

export const EXPERIENCE_PRICE_MODES = ["FREE", "PRICED", "UNKNOWN"] as const;
export type ExperiencePriceMode = (typeof EXPERIENCE_PRICE_MODES)[number];

export const EXPERIENCE_SOURCE_TYPES = [
  "OFFICIAL",
  "ORGANIZER",
  "VENUE",
  "TICKETING",
  "CURATED",
  "OTHER",
] as const;
export type ExperienceSourceType = (typeof EXPERIENCE_SOURCE_TYPES)[number];

export const EXPERIENCE_MEDIA_STATUSES = ["READY", "NEEDS_REVIEW", "PLACEHOLDER"] as const;
export type ExperienceMediaStatus = (typeof EXPERIENCE_MEDIA_STATUSES)[number];

export const EXPERIENCE_CATEGORIES = [
  "culture",
  "art",
  "music",
  "show",
  "exhibition",
  "fair",
  "festival",
  "sport",
  "running",
  "outdoor",
  "workshop",
  "food",
  "kids",
  "free",
] as const;
export type ExperienceCategory = (typeof EXPERIENCE_CATEGORIES)[number];

export const EXPERIENCE_AUDIENCES = ["FAMILY", "COUPLE", "KIDS", "FRIENDS", "SOLO"] as const;
export type ExperienceAudience = (typeof EXPERIENCE_AUDIENCES)[number];

export const experienceCities = pgTable("experience_cities", {
  id: uuid("id").notNull().unique().defaultRandom(),
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  slug: text("slug").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  createdAt: createdAt(),
});

export const experienceOrganizers = pgTable("experience_organizers", {
  id: uuid("id").primaryKey().defaultRandom(),
  city: text("city")
    .notNull()
    .references(() => experienceCities.code),
  name: text("name").notNull(),
  nameFold: text("name_fold").notNull(),
  websiteUrl: text("website_url"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experienceOrganizerMembers = pgTable(
  "experience_organizer_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => experienceOrganizers.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [unique("experience_organizer_members_uidx").on(t.organizerId, t.userId)],
);

export const experienceVenues = pgTable("experience_venues", {
  id: uuid("id").primaryKey().defaultRandom(),
  city: text("city")
    .notNull()
    .references(() => experienceCities.code),
  name: text("name").notNull(),
  nameFold: text("name_fold").notNull(),
  address: text("address"),
  addressFold: text("address_fold").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experiences = pgTable("experiences", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  titleFold: text("title_fold").notNull(),
  city: text("city")
    .notNull()
    .default("Hanoi")
    .references(() => experienceCities.code),
  summary: text("summary").notNull(),
  whyGo: text("why_go").notNull(),
  body: text("body"),
  organizerId: uuid("organizer_id")
    .notNull()
    .references(() => experienceOrganizers.id, { onDelete: "restrict" }),
  venueId: uuid("venue_id")
    .notNull()
    .references(() => experienceVenues.id, { onDelete: "restrict" }),
  priceMode: text("price_mode").notNull(),
  priceFromVnd: integer("price_from_vnd"),
  priceToVnd: integer("price_to_vnd"),
  priceNote: text("price_note"),
  ageNote: text("age_note"),
  language: text("language"),
  durationMinutes: integer("duration_minutes"),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  audiences: jsonb("audiences").$type<string[]>().notNull().default([]),
  bookingUrl: text("booking_url"),
  coverUrl: text("cover_url"),
  imageUrls: jsonb("image_urls").$type<string[]>().notNull().default([]),
  mediaStatus: text("media_status").notNull().default("PLACEHOLDER"),
  bookingDeadline: timestamp("booking_deadline", { withTimezone: true, mode: "date" }),
  registrationDeadline: timestamp("registration_deadline", {
    withTimezone: true,
    mode: "date",
  }),
  soldOut: boolean("sold_out").notNull().default(false),
  /** Editorial priority only. Home visibility is chosen by time context. */
  featuredRank: integer("featured_rank"),
  status: text("status").notNull().default("DRAFT"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }),
  publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const experienceOccurrences = pgTable("experience_occurrences", {
  id: uuid("id").primaryKey().defaultRandom(),
  experienceId: uuid("experience_id")
    .notNull()
    .references(() => experiences.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true, mode: "date" }),
  createdAt: createdAt(),
});

export const experienceSources = pgTable("experience_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  experienceId: uuid("experience_id")
    .notNull()
    .references(() => experiences.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url").notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  importedBy: uuid("imported_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const experienceSaves = pgTable(
  "experience_saves",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    experienceId: uuid("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    saveFor: text("save_for"),
    createdAt: createdAt(),
  },
  (t) => [unique("experience_saves_user_experience_uidx").on(t.userId, t.experienceId)],
);

export const experienceInterests = pgTable(
  "experience_interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    experienceId: uuid("experience_id")
      .notNull()
      .references(() => experiences.id, { onDelete: "cascade" }),
    remindAt: timestamp("remind_at", { withTimezone: true, mode: "date" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
  },
  (t) => [unique("experience_interests_user_experience_uidx").on(t.userId, t.experienceId)],
);
