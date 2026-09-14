import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { NotificationService } from "./notification.service.js";

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

@Controller("notifications")
export class NotificationsController {
  constructor(@Inject(NotificationService) private readonly notifications: NotificationService) {}

  @Get("push/vapid-key")
  vapidKey() {
    return this.notifications.getVapidPublicKey();
  }

  @Post("push/subscribe")
  @UseGuards(SessionAuthGuard)
  subscribe(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = pushSubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid push subscription");
    }
    return this.notifications.subscribePush(userId, parsed.data);
  }

  @Post("push/test")
  @UseGuards(SessionAuthGuard)
  testPush(@CurrentUserId() userId: string) {
    return this.notifications.sendTestPush(userId);
  }

  @Post("push/unsubscribe")
  @UseGuards(SessionAuthGuard)
  unsubscribe(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = z.object({ endpoint: z.string().url() }).safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid endpoint");
    }
    return this.notifications.unsubscribePush(userId, parsed.data.endpoint);
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  list(@CurrentUserId() userId: string, @Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 30;
    return this.notifications.listForUser(userId, Number.isFinite(n) ? n : 30);
  }

  @Patch("read-all")
  @UseGuards(SessionAuthGuard)
  markAllRead(@CurrentUserId() userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(":notificationId/read")
  @UseGuards(SessionAuthGuard)
  markRead(@CurrentUserId() userId: string, @Param("notificationId") notificationId: string) {
    return this.notifications.markRead(userId, notificationId);
  }
}
