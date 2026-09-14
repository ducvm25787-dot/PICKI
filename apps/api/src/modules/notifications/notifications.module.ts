import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { OutboxWorker } from "../../jobs/outbox.worker.js";
import { NotificationService } from "./notification.service.js";
import { NotificationsController } from "./notifications.controller.js";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [OutboxService, NotificationService, OutboxWorker],
  exports: [OutboxService, NotificationService],
})
export class NotificationsModule {}
