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

  @Get("locations/:locationId/presence")
  @UseGuards(SessionAuthGuard)
  locationPresence(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.discovery.locationPresence(userId, locationId);
  }

  @Post("locations/:locationId/opening-reminder")
  @UseGuards(SessionAuthGuard)
  subscribeOpening(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.discovery.subscribeOpening(userId, locationId);
  }

  @Get("zones/:slugOrId/home")
  @UseGuards(SessionAuthGuard)
  async zoneHome(@Param("slugOrId") slugOrId: string, @CurrentUserId() userId: string) {
    return this.discovery.getHabitHome(slugOrId, userId);
  }

  @Get("zones/:slugOrId/familiar")
  @UseGuards(SessionAuthGuard)
  async zoneFamiliar(@Param("slugOrId") slugOrId: string, @CurrentUserId() userId: string) {
    return this.discovery.listZoneFamiliar(slugOrId, userId);
  }

  @Get("zones/:slugOrId/explore")
  @UseGuards(SessionAuthGuard)
  async zoneExplore(
    @Param("slugOrId") slugOrId: string,
    @CurrentUserId() userId: string,
    @Query("chip") chipRaw?: string,
  ) {
    const chip = (chipRaw ?? "open") as "new" | "open" | "near" | "popular" | "bia-hoi";
    if (!["new", "open", "near", "popular", "bia-hoi"].includes(chip)) {
      throw new PickiError("VALIDATION_ERROR", "chip must be new|open|near|popular|bia-hoi");
    }
    return this.discovery.exploreZone(slugOrId, chip, userId);
  }

  @Get("zones/:slugOrId/market/clusters/:clusterSlug")
  marketCluster(@Param("slugOrId") slugOrId: string, @Param("clusterSlug") clusterSlug: string) {
    return this.discovery.marketCluster(slugOrId, clusterSlug);
  }

  @Get("zones/:slugOrId/market/clusters")
  marketClusters(@Param("slugOrId") slugOrId: string) {
    return this.discovery.marketHome(slugOrId);
  }

  @Get("zones/:slugOrId/market/stores")
  marketStores(@Param("slugOrId") slugOrId: string) {
    return this.discovery.marketStores(slugOrId);
  }

  @Get("zones/:slugOrId/market")
  marketHome(@Param("slugOrId") slugOrId: string) {
    return this.discovery.marketHome(slugOrId);
  }

  @Get("zones/:slugOrId/discovery")
  async zoneDiscovery(@Param("slugOrId") slugOrId: string) {
    return this.discovery.getDiscovery(slugOrId);
  }

  @Get("zones/:slugOrId/browse/:categoryId")
  async zoneBrowse(
    @Param("slugOrId") slugOrId: string,
    @Param("categoryId") categoryId: string,
    @Query("types") types?: string,
    @Query("goods") goods?: string,
  ) {
    const providerTypes = (types ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (providerTypes.length === 0 && categoryId !== "market") {
      throw new PickiError("VALIDATION_ERROR", "types query required (comma-separated provider_type)");
    }
    const goodsCategoryId = goods?.trim() || null;
    if (goodsCategoryId && !/^[0-9a-f-]{36}$/i.test(goodsCategoryId)) {
      throw new PickiError("VALIDATION_ERROR", "goods must be a category id");
    }
    return this.discovery.browseCategory(slugOrId, categoryId, providerTypes, goodsCategoryId);
  }

  @Get("zones/:slugOrId/search")
  @UseGuards(SessionAuthGuard)
  async zoneSearch(
    @Param("slugOrId") slugOrId: string,
    @CurrentUserId() userId: string,
    @Query("q") q?: string,
  ) {
    return this.discovery.search(slugOrId, q ?? "", userId);
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

  @Post("me/familiar/:locationId/hide")
  @UseGuards(SessionAuthGuard)
  async hideFamiliar(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.discovery.hideFamiliar(userId, locationId);
  }
}
