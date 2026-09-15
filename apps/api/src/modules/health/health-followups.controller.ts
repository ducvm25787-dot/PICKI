import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { createHealthFollowupSchema } from "./dto.js";
import { HealthFollowupsService } from "./health-followups.service.js";

@Controller("provider/health")
@UseGuards(SessionAuthGuard)
export class HealthFollowupsController {
  constructor(@Inject(HealthFollowupsService) private readonly followups: HealthFollowupsService) {}

  @Get("patients")
  listPatients(@CurrentUserId() userId: string, @Query("locationId") locationId: string) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.followups.listPatients(userId, locationId);
  }

  @Get("followups")
  list(@CurrentUserId() userId: string, @Query("locationId") locationId: string) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.followups.listForLocation(userId, locationId);
  }

  @Post("followups")
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = createHealthFollowupSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid reminder", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.followups.create(userId, parsed.data);
  }

  @Patch("followups/:reminderId/cancel")
  cancel(@CurrentUserId() userId: string, @Param("reminderId") reminderId: string) {
    return this.followups.cancel(userId, reminderId);
  }
}
