import { Controller, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { NotificationService } from "./notification.service.js";

@Controller("notifications")
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get()
  list(@CurrentUserId() userId: string, @Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 30;
    return this.notifications.listForUser(userId, Number.isFinite(n) ? n : 30);
  }

  @Patch("read-all")
  markAllRead(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(":notificationId/read")
  markRead(@CurrentUserId() userId: string, @Param("notificationId") notificationId: string) {
    return this.notifications.markRead(userId, notificationId);
  }
}
