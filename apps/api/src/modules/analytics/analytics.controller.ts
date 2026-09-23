import { Body, Controller, Get, Inject, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AnalyticsService } from "./analytics.service.js";

const trackSchema = z.object({
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        zoneId: z.string().uuid().optional(),
        properties: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(20),
});

@Controller("analytics")
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Post("events")
  @UseGuards(SessionAuthGuard)
  async track(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = trackSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid analytics payload", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.analytics.track(userId, parsed.data.events);
  }

  @Get("summary")
  @UseGuards(SessionAuthGuard, AdminRoleGuard)
  async summary(@Query("days") daysRaw?: string) {
    const days = daysRaw ? Number(daysRaw) : 7;
    return this.analytics.summary(Number.isFinite(days) ? days : 7);
  }
}
