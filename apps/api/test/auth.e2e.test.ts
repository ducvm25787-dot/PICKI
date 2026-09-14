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

describe.skipIf(!databaseUrl)("Auth API (e2e)", () => {
  let nestApp: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let httpServer: any;

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
  });

  afterAll(async () => {
    await nestApp?.close();
  });

  it("GET /v1/health returns ok", async () => {
    const res = await request(httpServer).get("/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("phone OTP login sets session and GET /v1/me works", async () => {
    const phone = "+84901112233";

    const otpRes = await request(httpServer)
      .post("/v1/auth/otp/request")
      .send({ phone })
      .expect(200);

    expect(otpRes.body.devOtp).toMatch(/^\d{6}$/);

    const verifyRes = await request(httpServer)
      .post("/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.devOtp })
      .expect(200);

    expect(verifyRes.body.user.id).toBeDefined();
    expect(verifyRes.body.user.roles).toContain("CUSTOMER");
    expect(verifyRes.headers["set-cookie"]).toBeDefined();

    const cookie = verifyRes.headers["set-cookie"][0] as string;

    const meRes = await request(httpServer)
      .get("/v1/me")
      .set("Cookie", cookie)
      .expect(200);

    expect(meRes.body.id).toBe(verifyRes.body.user.id);
    expect(meRes.body.identities[0]?.provider).toBe("PHONE");
  });

  it("logout clears session", async () => {
    const phone = "+84903334455";
    const otpRes = await request(httpServer)
      .post("/v1/auth/otp/request")
      .send({ phone });
    const verifyRes = await request(httpServer)
      .post("/v1/auth/otp/verify")
      .send({ phone, code: otpRes.body.devOtp });
    const cookie = verifyRes.headers["set-cookie"][0] as string;

    await request(httpServer).post("/v1/auth/logout").set("Cookie", cookie).expect(204);
    await request(httpServer).get("/v1/me").set("Cookie", cookie).expect(401);
  });
});
