import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import {
  createClassifiedSchema,
  listClassifiedsQuerySchema,
  uploadClassifiedPhotoSchema,
} from "./dto.js";
import { ClassifiedPhotoService } from "./classified-photo.service.js";
import { ClassifiedsService } from "./classifieds.service.js";

@Controller("classifieds")
@UseGuards(SessionAuthGuard)
export class ClassifiedsController {
  constructor(
    @Inject(ClassifiedsService) private readonly classifieds: ClassifiedsService,
    @Inject(ClassifiedPhotoService) private readonly photos: ClassifiedPhotoService,
  ) {}

  @Post("photos")
  uploadPhoto(@Body() body: unknown) {
    const parsed = uploadClassifiedPhotoSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid photo", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.photos.saveFromDataUrl(parsed.data.dataUrl).then((url) => ({ url }));
  }

  @Post()
  create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = createClassifiedSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid listing", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.classifieds.create(userId, parsed.data);
  }

  @Get()
  list(@CurrentUserId() userId: string, @Query() query: unknown) {
    const parsed = listClassifiedsQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid query", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.classifieds.listForZone(userId, parsed.data);
  }

  @Get("mine")
  listMine(@CurrentUserId() userId: string) {
    return this.classifieds.listMine(userId);
  }

  @Get("reservations/mine")
  listMyReservations(@CurrentUserId() userId: string) {
    return this.classifieds.listMyReservations(userId);
  }

  @Get(":listingId")
  get(@CurrentUserId() userId: string, @Param("listingId") listingId: string) {
    return this.classifieds.get(userId, listingId);
  }

  @Post(":listingId/reserve")
  reserve(@CurrentUserId() userId: string, @Param("listingId") listingId: string) {
    return this.classifieds.reserve(userId, listingId);
  }

  @Patch(":listingId/complete")
  complete(@CurrentUserId() userId: string, @Param("listingId") listingId: string) {
    return this.classifieds.complete(userId, listingId);
  }

  @Patch(":listingId/cancel-reservation")
  cancelReservation(
    @CurrentUserId() userId: string,
    @Param("listingId") listingId: string,
  ) {
    return this.classifieds.cancelReservation(userId, listingId);
  }

  @Patch(":listingId/archive")
  archive(@CurrentUserId() userId: string, @Param("listingId") listingId: string) {
    return this.classifieds.archive(userId, listingId);
  }
}
