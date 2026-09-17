import { Body, Controller, Get, Inject, Param, Patch, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { patchLateNightSettingsSchema } from "./dto.js";
import { LateNightService } from "./late-night.service.js";

@Controller()
@UseGuards(SessionAuthGuard)
export class LateNightController {
  constructor(@Inject(LateNightService) private readonly lateNight: LateNightService) {}

  @Get("zones/:zoneId/late-night")
  listZone(@Param("zoneId") zoneId: string) {
    return this.lateNight.listForZone(zoneId);
  }

  @Get("provider/locations/:locationId/late-night/settings")
  getSettings(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.lateNight.getSettings(userId, locationId);
  }

  @Patch("provider/locations/:locationId/late-night/settings")
  patchSettings(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchLateNightSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid late-night settings", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.lateNight.patchSettings(userId, locationId, parsed.data);
  }
}
