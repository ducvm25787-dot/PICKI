import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { DiscoveryService } from "./discovery.service.js";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const favoriteSchema = z.object({
  locationId: z.string().uuid(),
});

@Controller()
export class DiscoveryController {
  constructor(@Inject(DiscoveryService) private readonly discovery: DiscoveryService) {}

  @Get("zones/:slugOrId/discovery")
  async zoneDiscovery(@Param("slugOrId") slugOrId: string) {
    return this.discovery.getDiscovery(slugOrId);
  }

  @Get("zones/:slugOrId/browse/:categoryId")
  async zoneBrowse(
    @Param("slugOrId") slugOrId: string,
    @Param("categoryId") categoryId: string,
    @Query("types") types?: string,
  ) {
    const providerTypes = (types ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (providerTypes.length === 0) {
      throw new PickiError("VALIDATION_ERROR", "types query required (comma-separated provider_type)");
    }
    return this.discovery.browseCategory(slugOrId, categoryId, providerTypes);
  }

  @Get("zones/:slugOrId/search")
  async zoneSearch(@Param("slugOrId") slugOrId: string, @Query("q") q?: string) {
    return this.discovery.search(slugOrId, q ?? "");
  }

  @Get("zones/:slugOrId/map")
  async zoneMap(
    @Param("slugOrId") slugOrId: string,
    @Query("open") open?: string,
    @Query("types") types?: string,
  ) {
    const providerTypes = (types ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    return this.discovery.map(slugOrId, {
      openOnly: open === "1" || open === "true",
      providerTypes: providerTypes.length > 0 ? providerTypes : undefined,
    });
  }

  @Get("locations/:locationId/reviews")
  async reviews(@Param("locationId") locationId: string) {
    return this.discovery.listReviews(locationId);
  }

  @Post("locations/:locationId/reviews")
  @UseGuards(SessionAuthGuard)
  async addReview(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = reviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid review", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.discovery.addReview(
      userId,
      locationId,
      parsed.data.rating,
      parsed.data.comment,
    );
  }

  @Get("locations/:locationId/specials")
  async specials(@Param("locationId") locationId: string) {
    return this.discovery.listDailySpecials(locationId);
  }

  @Get("me/favorites")
  @UseGuards(SessionAuthGuard)
  async favorites(@CurrentUserId() userId: string) {
    return this.discovery.listFavorites(userId);
  }

  @Post("me/favorites")
  @UseGuards(SessionAuthGuard)
  async addFavorite(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = favoriteSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid favorite", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.discovery.addFavorite(userId, parsed.data.locationId);
  }

  @Delete("me/favorites/:locationId")
  @UseGuards(SessionAuthGuard)
  async removeFavorite(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    await this.discovery.removeFavorite(userId, locationId);
    return { ok: true };
  }
}
