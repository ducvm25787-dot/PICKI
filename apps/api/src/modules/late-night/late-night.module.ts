import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { LateNightController } from "./late-night.controller.js";
import { LateNightService } from "./late-night.service.js";

@Module({
  imports: [AuthModule],
  controllers: [LateNightController],
  providers: [LateNightService],
  exports: [LateNightService],
})
export class LateNightModule {}
