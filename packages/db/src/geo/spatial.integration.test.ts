import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { migrate } from "../migrator.js";
import { containsPoint, distanceMeters, pointWithinGeometry } from "./spatial.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

/** Rough test polygon near Kim Văn – Kim Lũ anchor. */
const KVL_TEST_POLYGON =
  "POLYGON((105.839 20.987, 105.844 20.987, 105.844 20.991, 105.839 20.991, 105.839 20.987))";

const KVL_ANCHOR = { lat: 20.9883, lng: 105.8414 };
const OUTSIDE_HANOI = { lat: 21.05, lng: 106.0 };

describe.skipIf(!databaseUrl)("PostGIS spatial helpers", () => {
  const { sql } = createPickiDb(databaseUrl);

  beforeAll(async () => {
    await migrate({ databaseUrl });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("computes distance in meters", async () => {
    const d = await distanceMeters(sql, KVL_ANCHOR, { lat: 20.9883, lng: 105.8514 });
    expect(d).toBeGreaterThan(800);
    expect(d).toBeLessThan(1200);
  });

  it("detects point inside polygon", async () => {
    expect(await containsPoint(sql, KVL_TEST_POLYGON, KVL_ANCHOR)).toBe(true);
    expect(await pointWithinGeometry(sql, KVL_TEST_POLYGON, KVL_ANCHOR)).toBe(true);
    expect(await containsPoint(sql, KVL_TEST_POLYGON, OUTSIDE_HANOI)).toBe(false);
  });
});
