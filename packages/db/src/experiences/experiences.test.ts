import assert from "node:assert/strict";
import test from "node:test";
import { findPossibleDuplicate } from "./duplicate.js";
import { foldText } from "./fold.js";
import { HOME_EXPERIENCE_ROTATE_MS, selectHomeExperiences } from "./home.js";
import { parseExperienceImport } from "./validate.js";
import { homeContext, occurrenceInWindow, occurrenceStillListed, filterWindow } from "./windows.js";
import type { ExperienceImport } from "./validate.js";

const base = {
  title: "Khúc Hoan Ca",
  city: "Hanoi",
  summary: "Chương trình hợp xướng tại Nhà hát Hồ Gươm.",
  why_go: "Một tối nhạc rõ lịch, hợp cả nhà.",
  organizer: { name: "Nhà hát Hồ Gươm", website_url: "https://nhahat.example" },
  venue: { name: "Nhà hát Hồ Gươm", address: "40 Hàng Bài", lat: 21.02, lng: 105.85 },
  occurrences: [{ start_at: "2026-10-24T19:30:00+07:00", end_at: "2026-10-24T21:30:00+07:00" }],
  price_mode: "PRICED",
  price_from: 200000,
  price_to: 500000,
  price_note: "Có khu vực đứng miễn phí phía sau",
  age_note: null,
  language: "vi",
  duration_minutes: 120,
  categories: ["music", "show"],
  audiences: ["FAMILY", "COUPLE"],
  booking_url: "https://ticket.example/khuc",
  source_url: "https://nhahat.example/khuc",
  source_type: "OFFICIAL",
  source_name: "Website Nhà hát",
  media: { cover_url: null, media_status: "PLACEHOLDER" },
};

test("fold drops Vietnamese accents", () => {
  assert.equal(foldText("Khúc Hoan Ca"), "khuc hoan ca");
});

test("priced import with a free-area note stays PRICED", () => {
  const parsed = parseExperienceImport(base);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.value?.priceMode, "PRICED");
  assert.equal(parsed.value?.priceFrom, 200000);
  assert.match(parsed.value?.priceNote ?? "", /miễn phí/);
});

test("null price is not free", () => {
  const parsed = parseExperienceImport({ ...base, price_mode: "UNKNOWN", price_from: null, price_to: null });
  assert.equal(parsed.value?.priceMode, "UNKNOWN");
  const asFree = parseExperienceImport({ ...base, price_mode: "FREE", price_from: null, price_to: null });
  assert.equal(asFree.value?.priceMode, "FREE");
  const inferred = parseExperienceImport({ ...base, price_mode: "FREE", price_from: null, price_to: 0 });
  assert.equal(inferred.value, null);
  assert.ok(inferred.errors.some((error) => error.path === "price_mode"));
});

test("missing source and a closed city fail", () => {
  const parsed = parseExperienceImport({ ...base, city: "HoChiMinh", source_url: "" });
  assert.equal(parsed.value, null);
  assert.ok(parsed.errors.some((error) => error.path === "city"));
  assert.ok(parsed.errors.some((error) => error.path === "source_url"));
});

test("an opened city parses without a Hanoi-only rule", () => {
  const parsed = parseExperienceImport({ ...base, city: "HoChiMinh" }, ["Hanoi", "HoChiMinh"]);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.value?.city, "HoChiMinh");
});

test("duplicate when title, venue and day match across accent", () => {
  const parsed = parseExperienceImport({ ...base, title: "Khuc Hoan Ca" });
  assert.ok(parsed.value);
  const match = findPossibleDuplicate(parsed.value as ExperienceImport, [
    {
      id: "existing",
      title: "Khúc Hoan Ca",
      titleFold: "khuc hoan ca",
      organizerFold: "nha hat ho guom",
      venueFold: "nha hat ho guom",
      venueName: "Nhà hát Hồ Gươm",
      starts: [new Date("2026-10-24T19:30:00+07:00")],
    },
  ]);
  assert.equal(match?.id, "existing");
  assert.equal(match?.venueName, "Nhà hát Hồ Gươm");
});

test("same title on another day is not auto-merged signal alone when venue differs", () => {
  const parsed = parseExperienceImport(base);
  const match = findPossibleDuplicate(parsed.value as ExperienceImport, [
    {
      id: "other",
      title: "Khúc Hoan Ca",
      titleFold: "khuc hoan ca",
      organizerFold: "don vi khac",
      venueFold: "nha hat lon",
      venueName: "Nhà hát Lớn",
      starts: [new Date("2026-11-02T19:30:00+07:00")],
    },
  ]);
  assert.equal(match, null);
});

test("Tuesday home copy points at this weekend", () => {
  const ctx = homeContext(new Date("2026-09-22T10:00:00+07:00"));
  assert.equal(ctx.copy, "Cuối tuần này đi đâu?");
  assert.equal(ctx.when, "weekend");
});

test("Sunday evening home copy points at next week", () => {
  const now = new Date("2026-09-27T18:00:00+07:00");
  const ctx = homeContext(now);
  assert.equal(ctx.copy, "Tuần tới có gì?");
  const soon = new Date("2026-10-02T19:00:00+07:00");
  assert.equal(occurrenceInWindow(soon, ctx.window, now), true);
  const thisWeekend = new Date("2026-09-26T19:00:00+07:00");
  assert.equal(occurrenceInWindow(thisWeekend, ctx.window, now), false);
});

test("a show three weeks out stays in upcoming and out of this weekend", () => {
  const now = new Date("2026-09-22T10:00:00+07:00");
  const show = new Date("2026-10-13T19:30:00+07:00");
  assert.equal(occurrenceInWindow(show, filterWindow("upcoming", now), now), true);
  assert.equal(occurrenceInWindow(show, filterWindow("weekend", now), now), false);
});

test("a show comes down once its Vietnam calendar day has passed", () => {
  const fridayNight = new Date("2026-10-02T20:00:00+07:00");
  const saturdayMorning = new Date("2026-10-03T11:46:00+07:00");
  const saturdayNight = new Date("2026-10-03T20:00:00+07:00");
  assert.equal(occurrenceStillListed(fridayNight, saturdayMorning), false);
  assert.equal(occurrenceStillListed(saturdayNight, saturdayMorning), true);
  assert.equal(occurrenceStillListed(fridayNight, new Date("2026-10-02T23:30:00+07:00")), true);
});

test("home rotates every live show equally", () => {
  const start = new Date("2026-10-03T20:00:00+07:00");
  const fitting = [
    { id: "c", featuredRank: 1, startAt: start },
    { id: "a", featuredRank: null, startAt: start },
    { id: "b", featuredRank: 9, startAt: new Date(start.getTime() + 60_000) },
  ];
  const seen = new Set<string>();
  for (let step = 0; step < fitting.length; step += 1) {
    const now = new Date(step * HOME_EXPERIENCE_ROTATE_MS);
    const selected = selectHomeExperiences(fitting, now);
    assert.equal(selected.source, "rotation");
    assert.equal(selected.items.length, 3);
    seen.add(selected.items[0]!.id);
  }
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
  assert.equal(selectHomeExperiences([]).source, "empty");
});
