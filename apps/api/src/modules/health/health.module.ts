import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { HealthFollowupWorker } from "../../jobs/health-followup.worker.js";
import { HealthFollowupsController } from "./health-followups.controller.js";
import { HealthFollowupsService } from "./health-followups.service.js";

@Module({
  imports: [AuthModule],
  controllers: [HealthFollowupsController],
  providers: [HealthFollowupsService, OutboxService, HealthFollowupWorker],
})
export class HealthModule {}
