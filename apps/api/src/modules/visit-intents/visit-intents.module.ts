import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { VisitIntentsController } from "./visit-intents.controller.js";
import { VisitIntentsService } from "./visit-intents.service.js";

@Module({
  imports: [AuthModule],
  controllers: [VisitIntentsController],
  providers: [VisitIntentsService, OutboxService],
})
export class VisitIntentsModule {}
