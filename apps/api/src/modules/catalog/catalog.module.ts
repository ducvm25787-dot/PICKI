import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { QrController } from "./qr.controller.js";

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, QrController],
  providers: [CatalogService],
})
export class CatalogModule {}
