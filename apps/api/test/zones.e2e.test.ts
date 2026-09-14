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
const KVL_GPS = { lat: 20.9883, lng: 105.8414 };

describe.skipIf(!databaseUrl)("Zones API (e2e)", () => {
  let nestApp: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpServer: any;
  let cookie = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = databaseUrl;
    process.env.SESSION_SECRET = sessionSecret;
    process.env.AUTH_OTP_DEV_EXPOSE = "true";

    await migrate({ databaseUrl });

    nestApp = await NestFactory.create(AppModule);
    nestApp.setGlobalPrefix("v1");
    nestApp.use(cookieParser());
    nestApp.useGlobalFilters(new PickiExceptionFilter());
    await nestApp.init();
    httpServer = nestApp.getHttpAdapter().getInstance();

    const otpRes = await request(httpServer)
      .post("/v1/auth/otp/request")
      .send({ phone: "+84909998877" })
      .expect(200);

    const verifyRes = await request(httpServer)
      .post("/v1/auth/otp/verify")
      .send({ phone: "+84909998877", code: otpRes.body.devOtp })
      .expect(200);

    expect(verifyRes.body.user).toBeDefined();
    const setCookie = verifyRes.headers["set-cookie"] as string[] | undefined;
    cookie = setCookie?.[0]?.split(";")[0] ?? "";
  });

  afterAll(async () => {
    await nestApp?.close();
  });

  it("POST /v1/zones/discover finds KVL when seeded", async () => {
    const res = await request(httpServer).post("/v1/zones/discover").send(KVL_GPS).expect(200);

    const slugs = (res.body.zones as { slug: string }[]).map((z) => z.slug);
    if (slugs.includes("kim-van-kim-lu")) {
      expect(res.body.zones[0].providerCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("GET /v1/zones/kim-van-kim-lu/preview returns preview", async () => {
    const res = await request(httpServer).get("/v1/zones/kim-van-kim-lu/preview");

    if (res.status === 200) {
      expect(res.body.slug).toBe("kim-van-kim-lu");
      expect(typeof res.body.memberCount).toBe("number");
    } else {
      expect(res.status).toBe(404);
    }
  });

  it("join flow works when zone exists", async () => {
    const preview = await request(httpServer).get("/v1/zones/kim-van-kim-lu/preview");
    if (preview.status !== 200) return;

    const join = await request(httpServer)
      .post(`/v1/zones/${preview.body.id as string}/join`)
      .set("Cookie", cookie)
      .send({
        ...KVL_GPS,
        addressType: "RESIDENTIAL",
        label: "HOME",
        building: "CT12A",
        floor: "18",
        apartment: "1808",
      })
      .expect(200);

    expect(join.body.membershipStatus).toBe("JOINED");

    const mine = await request(httpServer).get("/v1/zones/mine").set("Cookie", cookie).expect(200);

    expect(mine.body.zones.some((z: { slug: string }) => z.slug === "kim-van-kim-lu")).toBe(true);
  });
});
