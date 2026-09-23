import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { ActivityService } from "./activity.service.js";

@Controller("me")
@UseGuards(SessionAuthGuard)
export class ActivityController {
  constructor(@Inject(ActivityService) private readonly activity: ActivityService) {}

  @Get("activity")
  listMine(@CurrentUserId() userId: string) {
    return this.activity.listMine(userId);
  }
}
