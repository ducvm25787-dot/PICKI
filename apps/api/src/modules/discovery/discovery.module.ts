import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ZonesModule } from "../zones/zones.module.js";
import { DiscoveryController } from "./discovery.controller.js";
import { DiscoveryService } from "./discovery.service.js";

@Module({
  imports: [AuthModule, ZonesModule, AnalyticsModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
  exports: [DiscoveryService],
})
export class DiscoveryModule {}
