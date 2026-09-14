import { Module } from "@nestjs/common";
import { AddressesModule } from "../addresses/addresses.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ZonesController } from "./zones.controller.js";
import { ZonesService } from "./zones.service.js";

@Module({
  imports: [AddressesModule, AuthModule],
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
