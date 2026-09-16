import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  createFamilyDinnerRecipeSchema,
  createLateDinnerOfferSchema,
  createRecipeVersionSchema,
  lockFamilyDinnerSchema,
  patchFamilyDinnerItemSchema,
  patchFamilyDinnerSettingsSchema,
  publishFamilyDinnerMenuSchema,
  upsertInventorySchema,
} from "./dto.js";
import {
  defaultDinnerServiceDate,
  FamilyDinnerService,
} from "./family-dinner.service.js";

@Controller()
@UseGuards(SessionAuthGuard)
export class FamilyDinnerController {
  constructor(@Inject(FamilyDinnerService) private readonly dinner: FamilyDinnerService) {}

  @Get("zones/:zoneId/family-dinner")
  listZone(
    @Param("zoneId") zoneId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.listForZone(zoneId, date);
  }

  @Get("zones/:zoneId/family-dinner/late")
  listLateZone(
    @Param("zoneId") zoneId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.listLateForZone(zoneId, date);
  }

  @Get("locations/:locationId/family-dinner")
  getMenu(
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.getMenu(locationId, date);
  }

  @Get("locations/:locationId/family-dinner/late")
  listLateLocation(
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.listLateForLocation(locationId, date);
  }

  @Post("provider/locations/:locationId/family-dinner/menu")
  publish(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = publishFamilyDinnerMenuSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid family dinner menu", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.publishMenu(userId, locationId, parsed.data);
  }

  @Get("provider/locations/:locationId/family-dinner/ops")
  ops(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.getOps(userId, locationId, date);
  }

  @Patch("provider/locations/:locationId/family-dinner/settings")
  patchSettings(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchFamilyDinnerSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid settings", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.patchSettings(userId, locationId, parsed.data);
  }

  @Patch("provider/locations/:locationId/family-dinner/items/:itemId")
  patchItem(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchFamilyDinnerItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid item patch", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.patchItem(userId, locationId, itemId, parsed.data);
  }

  @Post("provider/locations/:locationId/family-dinner/lock")
  lock(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = lockFamilyDinnerSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid lock body", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.lockProduction(userId, locationId, parsed.data.serviceDate);
  }

  @Get("provider/locations/:locationId/family-dinner/recipes")
  listRecipes(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
  ) {
    return this.dinner.listRecipes(userId, locationId);
  }

  @Post("provider/locations/:locationId/family-dinner/recipes")
  createRecipe(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = createFamilyDinnerRecipeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid recipe", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.createRecipe(userId, locationId, parsed.data);
  }

  @Post("provider/locations/:locationId/family-dinner/recipes/:recipeId/versions")
  createRecipeVersion(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("recipeId") recipeId: string,
    @Body() body: unknown,
  ) {
    const parsed = createRecipeVersionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid recipe version", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.createRecipeVersion(userId, locationId, recipeId, parsed.data);
  }

  @Get("provider/locations/:locationId/family-dinner/procurement")
  procurement(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultDinnerServiceDate();
    return this.dinner.getProcurement(userId, locationId, date);
  }

  @Put("provider/locations/:locationId/family-dinner/inventory")
  inventory(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertInventorySchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid inventory", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.upsertInventory(userId, locationId, parsed.data);
  }

  @Post("provider/locations/:locationId/family-dinner/late-offers")
  createLateOffer(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = createLateDinnerOfferSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid late offer", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.dinner.createLateOffer(userId, locationId, parsed.data);
  }
}
