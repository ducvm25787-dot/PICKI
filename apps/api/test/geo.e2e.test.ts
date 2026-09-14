import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory, type INestApplication } from "@nestjs/core";
import { migrate } from "@picki/db";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { PickiExceptionFilter } from "../src/shared/picki-exception.filter.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const sessionSecret = process.env.SESSION_SECRET ?? "test-secret-min-16-chars";

const KVL_TEST_POLYGON =
  "POLYGON((105.839 20.987, 105.844 20.987, 105.844 20.991, 105.839 20.991, 105.839 20.987))";

describe.skipIf(!databaseUrl)("Geo API (e2e)", () => {
  let nestApp: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpServer: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.SESSION_SECRET = sessionSecret;

    await migrate({ databaseUrl });

    nestApp = await NestFactory.create(AppModule);
    nestApp.setGlobalPrefix("v1");
    nestApp.use(cookieParser());
    nestApp.useGlobalFilters(new PickiExceptionFilter());
    await nestApp.init();
    httpServer = nestApp.getHttpAdapter().getInstance();
  });

  afterAll(async () => {
    await nestApp?.close();
  });

  it("GET /v1/geo/status returns PostGIS version", async () => {
    const res = await request(httpServer).get("/v1/geo/status").expect(200);
    expect(res.body.postgisVersion).toBeDefined();
    expect(res.body.routingProvider).toBe("local");
  });

  it("POST /v1/geo/distance returns meters", async () => {
    const res = await request(httpServer)
      .post("/v1/geo/distance")
      .send({
        from: { lat: 20.9883, lng: 105.8414 },
        to: { lat: 20.9883, lng: 105.8514 },
      })
      .expect(200);

    expect(res.body.source).toBe("postgis");
    expect(res.body.meters).toBeGreaterThan(800);
  });

  it("POST /v1/geo/contains detects KVL test polygon", async () => {
    const inside = await request(httpServer)
      .post("/v1/geo/contains")
      .send({
        geometryWkt: KVL_TEST_POLYGON,
        point: { lat: 20.9883, lng: 105.8414 },
      })
      .expect(200);
    expect(inside.body.contained).toBe(true);

    const outside = await request(httpServer)
      .post("/v1/geo/contains")
      .send({
        geometryWkt: KVL_TEST_POLYGON,
        point: { lat: 21.05, lng: 106.0 },
      })
      .expect(200);
    expect(outside.body.contained).toBe(false);
  });

  it("POST /v1/geo/eta returns fallback ETA", async () => {
    const res = await request(httpServer)
      .post("/v1/geo/eta")
      .send({
        from: { lat: 20.9883, lng: 105.8414 },
        to: { lat: 20.9883, lng: 105.8514 },
      })
      .expect(200);

    expect(res.body.seconds).toBeGreaterThan(0);
    expect(["adapter", "haversine_fallback"]).toContain(res.body.source);
  });
});
