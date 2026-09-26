import assert from "node:assert/strict";
import test from "node:test";
import { freshnessLabel, locationFreshness } from "./freshness.js";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-25T08:00:00+07:00");

test("future opens_at is upcoming", () => {
  const freshness = locationFreshness(new Date(now.getTime() + day), now, now);
  assert.equal(freshness, "UPCOMING");
  assert.equal(freshnessLabel(freshness), "Sắp khai trương");
});

test("opened within 14 days stays new", () => {
  assert.equal(locationFreshness(new Date(now.getTime() - 3 * day), now, now), "NEW");
});

test("badge drops after 14 days", () => {
  assert.equal(locationFreshness(new Date(now.getTime() - 15 * day), now, now), null);
});

test("no opens_at uses created_at for the new window", () => {
  assert.equal(locationFreshness(null, new Date(now.getTime() - day), now), "NEW");
  assert.equal(locationFreshness(null, new Date(now.getTime() - 20 * day), now), null);
});
