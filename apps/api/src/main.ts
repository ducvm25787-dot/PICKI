import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import path from "node:path";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config.js";
import { PickiExceptionFilter } from "./shared/picki-exception.filter.js";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.useStaticAssets(path.join(process.cwd(), "storage", "uploads"), {
    prefix: "/v1/uploads/",
  });

  app.setGlobalPrefix("v1");
  app.enableCors({
    origin: [process.env.WEB_ORIGIN ?? "http://localhost:3001"],
    credentials: true,
  });
  app.use(cookieParser());
  app.useGlobalFilters(new PickiExceptionFilter());

  await app.listen(config.apiPort);
  console.log(`Picki API listening on http://localhost:${String(config.apiPort)}/v1`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
