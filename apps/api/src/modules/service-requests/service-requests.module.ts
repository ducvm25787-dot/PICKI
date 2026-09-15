import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { ServiceRequestsController } from "./service-requests.controller.js";
import { ServiceRequestsService } from "./service-requests.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ServiceRequestsController],
  providers: [ServiceRequestsService, OutboxService],
})
export class ServiceRequestsModule {}
