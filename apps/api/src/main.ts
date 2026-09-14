import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./shared/config.js";
import { PickiExceptionFilter } from "./shared/picki-exception.filter.js";

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule);

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
