import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  createDailyUpdateSchema,
  providerOrderActionSchema,
  updateDailyUpdateSchema,
  updateLiveStatusSchema,
  createPromotionSchema,
  setOpensAtSchema,
  updateProviderProfileSchema,
  upsertLoyaltyBenefitSchema,
  upsertLoyaltyProgramSchema,
} from "./dto.js";
import { ProviderService } from "./provider.service.js";

@Controller("provider")
@UseGuards(SessionAuthGuard)
export class ProviderController {
  constructor(@Inject(ProviderService) private readonly providerService: ProviderService) {}

  @Get("locations/mine")
  async myLocations(@CurrentUserId() userId: string) {
    return this.providerService.listMyLocations(userId);
  }

  @Get("locations/:locationId/profile")
  async getProfile(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.providerService.getProfile(userId, locationId);
  }

  @Patch("locations/:locationId/opens-at")
  async setOpensAt(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = setOpensAtSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid opening date", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.setOpensAt(userId, locationId, parsed.data.opensAt);
  }

  @Get("locations/:locationId/promotions")
  async listPromotions(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.providerService.listPromotions(userId, locationId);
  }

  @Post("locations/:locationId/promotions")
  async createPromotion(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = createPromotionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid promotion", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.createPromotion(userId, locationId, parsed.data);
  }

  @Delete("locations/:locationId/promotions/:promotionId")
  async deletePromotion(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("promotionId") promotionId: string,
  ) {
    return this.providerService.deletePromotion(userId, locationId, promotionId);
  }

  @Patch("locations/:locationId/profile")
  async updateProfile(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateProviderProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid profile", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.updateProfile(userId, locationId, parsed.data);
  }

  @Get("locations/:locationId/today")
  async listToday(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.providerService.listDailyUpdates(userId, locationId);
  }

  @Post("locations/:locationId/today")
  async createToday(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = createDailyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid today update", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.createDailyUpdate(userId, locationId, parsed.data);
  }

  @Patch("locations/:locationId/today/:updateId")
  async patchToday(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateDailyUpdateSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid today update", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.updateDailyUpdate(userId, locationId, updateId, parsed.data);
  }

  @Delete("locations/:locationId/today/:updateId")
  async deleteToday(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("updateId") updateId: string,
  ) {
    return this.providerService.deleteDailyUpdate(userId, locationId, updateId);
  }

  @Get("locations/:locationId/loyalty")
  async getLoyalty(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.providerService.getLoyalty(userId, locationId);
  }

  @Patch("locations/:locationId/loyalty")
  async patchLoyalty(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertLoyaltyProgramSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid loyalty program", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.upsertLoyaltyProgram(userId, locationId, parsed.data);
  }

  @Post("locations/:locationId/loyalty/benefits")
  async addBenefit(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertLoyaltyBenefitSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid loyalty benefit", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.providerService.addLoyaltyBenefit(userId, locationId, parsed.data);
  }

  @Get("orders")
  async orders(@CurrentUserId() userId: string, @Query("locationId") locationId: string) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.providerService.listLocationOrders(userId, locationId);
  }

  @Get("orders/history")
  async orderHistory(@CurrentUserId() userId: string, @Query("locationId") locationId: string) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.providerService.listLocationOrderHistory(userId, locationId);
  }

  @Get("runner-stats/daily")
  async dailyRunnerStats(
    @CurrentUserId() userId: string,
    @Query("locationId") locationId: string,
    @Query("date") date?: string,
  ) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.providerService.dailyRunnerStats(userId, locationId, date);
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
