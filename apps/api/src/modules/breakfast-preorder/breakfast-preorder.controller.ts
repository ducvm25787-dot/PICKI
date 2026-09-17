import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  copyLastBreakfastMenuSchema,
  patchBreakfastItemSchema,
  patchBreakfastSettingsSchema,
  publishBreakfastMenuSchema,
} from "./dto.js";
import {
  BreakfastPreorderService,
  defaultBreakfastServiceDate,
} from "./breakfast-preorder.service.js";

@Controller()
@UseGuards(SessionAuthGuard)
export class BreakfastPreorderController {
  constructor(
    @Inject(BreakfastPreorderService) private readonly breakfast: BreakfastPreorderService,
  ) {}

  @Get("zones/:zoneId/breakfast-preorder")
  listZone(
    @Param("zoneId") zoneId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultBreakfastServiceDate();
    return this.breakfast.listForZone(zoneId, date);
  }

  @Get("locations/:locationId/breakfast-preorder")
  getMenu(
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultBreakfastServiceDate();
    return this.breakfast.getMenu(locationId, date);
  }

  @Post("provider/locations/:locationId/breakfast-preorder/menu")
  publish(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = publishBreakfastMenuSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid breakfast menu", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.breakfast.publishMenu(userId, locationId, parsed.data);
  }

  @Get("provider/locations/:locationId/breakfast-preorder/ops")
  ops(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Query("serviceDate") serviceDate?: string,
  ) {
    const date = serviceDate ?? defaultBreakfastServiceDate();
    return this.breakfast.getOps(userId, locationId, date);
  }

  @Patch("provider/locations/:locationId/breakfast-preorder/settings")
  patchSettings(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchBreakfastSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid settings", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.breakfast.patchSettings(userId, locationId, parsed.data);
  }

  @Patch("provider/locations/:locationId/breakfast-preorder/items/:itemId")
  patchItem(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
  ) {
    const parsed = patchBreakfastItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid item patch", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.breakfast.patchItem(userId, locationId, itemId, parsed.data);
  }

  @Post("provider/locations/:locationId/breakfast-preorder/copy-last-menu")
  copyLastMenu(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = copyLastBreakfastMenuSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid copy-last-menu", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.breakfast.copyLastMenuForProvider(userId, locationId, parsed.data);
  }
}
