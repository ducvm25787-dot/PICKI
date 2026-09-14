import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { MessagingController } from "./messaging.controller.js";
import { MessagingService } from "./messaging.service.js";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
