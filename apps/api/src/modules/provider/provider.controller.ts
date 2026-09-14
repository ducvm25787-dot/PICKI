import { Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { providerOrderActionSchema, updateLiveStatusSchema } from "./dto.js";
import { ProviderService } from "./provider.service.js";

@Controller("provider")
@UseGuards(SessionAuthGuard)
export class ProviderController {
  constructor(@Inject(ProviderService) private readonly providerService: ProviderService) {}

  @Get("locations/mine")
  async myLocations(@CurrentUserId() userId: string) {
    return this.providerService.listMyLocations(userId);
  }

  @Get("orders")
  async orders(@CurrentUserId() userId: string, @Query("locationId") locationId: string) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.providerService.listLocationOrders(userId, locationId);
  }

  @Patch("orders/:orderId")
  async orderAction(
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = providerOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.applyOrderAction(userId, orderId, parsed.data);
  }

  @Get("locations/:locationId/live-status")
  async getLiveStatus(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.providerService.getLiveStatus(userId, locationId);
  }

  @Patch("locations/:locationId/live-status")
  async liveStatus(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateLiveStatusSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid live status", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.updateLiveStatus(userId, locationId, parsed.data);
  }
}
