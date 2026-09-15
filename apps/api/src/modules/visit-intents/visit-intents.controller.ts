import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { createVisitIntentSchema, providerVisitIntentActionSchema } from "./dto.js";
import { VisitIntentsService } from "./visit-intents.service.js";

@Controller()
@UseGuards(SessionAuthGuard)
export class VisitIntentsController {
  constructor(@Inject(VisitIntentsService) private readonly visits: VisitIntentsService) {}

  @Post("visit-intents")
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = createVisitIntentSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid visit intent", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.visits.create(userId, parsed.data);
  }

  @Get("visit-intents/mine")
  getMine(
    @CurrentUserId() userId: string,
    @Query("locationId") locationId: string,
  ) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.visits.getMine(userId, locationId);
  }

  @Patch("visit-intents/:intentId/cancel")
  cancel(@CurrentUserId() userId: string, @Param("intentId") intentId: string) {
    return this.visits.cancel(userId, intentId);
  }

  @Get("provider/visit-intents")
  listForProvider(
    @CurrentUserId() userId: string,
    @Query("locationId") locationId: string,
  ) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    return this.visits.listForProvider(userId, locationId);
  }

  @Get("provider/visit-intents/history")
  listHistoryForProvider(
    @CurrentUserId() userId: string,
    @Query("locationId") locationId: string,
    @Query("limit") limitRaw?: string,
  ) {
    if (!locationId) {
      throw new PickiError("VALIDATION_ERROR", "locationId is required");
    }
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    return this.visits.listHistoryForProvider(userId, locationId, Number.isFinite(limit) ? limit : 50);
  }

  @Patch("provider/visit-intents/:intentId")
  providerAction(
    @CurrentUserId() userId: string,
    @Param("intentId") intentId: string,
    @Body() body: unknown,
  ) {
    const parsed = providerVisitIntentActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.visits.providerAction(userId, intentId, parsed.data);
  }
}
