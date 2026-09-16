import { Module } from "@nestjs/common";
import { FamilyDinnerCutoffWorker } from "../../jobs/family-dinner-cutoff.worker.js";
import { AuthModule } from "../auth/auth.module.js";
import { FamilyDinnerController } from "./family-dinner.controller.js";
import { FamilyDinnerService } from "./family-dinner.service.js";

@Module({
  imports: [AuthModule],
  controllers: [FamilyDinnerController],
  providers: [FamilyDinnerService, FamilyDinnerCutoffWorker],
  exports: [FamilyDinnerService],
})
export class FamilyDinnerModule {}
