import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { QrController } from "./qr.controller.js";

@Module({
  controllers: [CatalogController, QrController],
  providers: [CatalogService],
})
export class CatalogModule {}
