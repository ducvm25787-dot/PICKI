import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard, sessionTokenForRequest } from "../auth/session-auth.guard.js";
import { SessionService } from "../auth/session.service.js";
import { ExperiencesService } from "./experiences.service.js";
import { ExperiencePhotoService } from "./experience-photo.service.js";
import { experienceSubmissionSchema } from "./dto.js";
import type { WhenFilter } from "@picki/db";

const WHEN = new Set(["today", "weekend", "next_week", "upcoming"]);

@Controller("cities/:citySlug/experiences")
export class ExperiencesController {
  constructor(
    @Inject(ExperiencesService) private readonly experiences: ExperiencesService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(ExperiencePhotoService) private readonly photos: ExperiencePhotoService,
  ) {}

  @Post("photos")
  @UseGuards(SessionAuthGuard)
  async uploadPhoto(@Param("citySlug") citySlug: string, @Body() body: { dataUrl?: string }) {
    await this.experiences.requireOpenCity(citySlug);
    if (!body?.dataUrl) throw new PickiError("VALIDATION_ERROR", "Thiếu ảnh");
    const url = await this.photos.saveFromDataUrl(body.dataUrl);
    return { url };
  }

  @Get("mine")
  @UseGuards(SessionAuthGuard)
  async mine(@CurrentUserId() userId: string, @Param("citySlug") citySlug: string) {
    const city = await this.experiences.requireOpenCity(citySlug);
    return this.experiences.listMine(userId, city);
  }

  @Post("submissions")
  @UseGuards(SessionAuthGuard)
  async submit(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Body() body: unknown,
  ) {
    const city = await this.experiences.requireOpenCity(citySlug);
    const parsed = experienceSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Bài gửi chưa đủ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.experiences.submit(userId, city, parsed.data);
  }

  @Patch("submissions/:id")
  @UseGuards(SessionAuthGuard)
  async updateSubmission(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const city = await this.experiences.requireOpenCity(citySlug);
    const parsed = experienceSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Bài gửi chưa đủ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.experiences.updateSubmission(userId, city, id, parsed.data);
  }

  @Get("home-card")
  async homeCard(@Param("citySlug") citySlug: string) {
    const city = await this.experiences.requireOpenCity(citySlug);
    return this.experiences.homeCard(city);
  }

  @Get()
  async list(
    @Req() req: Request,
    @Param("citySlug") citySlug: string,
    @Query("when") when?: string,
    @Query("price") price?: string,
    @Query("audience") audience?: string,
    @Query("category") category?: string,
    @Query("q") q?: string,
    @Query("saved") saved?: string,
    @Query("interested") interested?: string,
  ) {
    const city = await this.experiences.requireOpenCity(citySlug);
    if (when && !WHEN.has(when)) {
      throw new PickiError("VALIDATION_ERROR", "Bộ lọc thời gian không hợp lệ");
    }
    const userId = await this.viewer(req);
    return this.experiences.listPublic(
      city,
      {
        when: when as WhenFilter | undefined,
        price,
        audience,
        category,
        q,
        saved: saved === "1",
        interested: interested === "1",
      },
      userId,
    );
  }

  @Get(":id")
  async detail(@Req() req: Request, @Param("citySlug") citySlug: string, @Param("id") id: string) {
    const city = await this.experiences.requireOpenCity(citySlug);
    return this.experiences.getPublic(city, id, await this.viewer(req));
  }

  @Post(":id/save")
  @UseGuards(SessionAuthGuard)
  async save(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
    @Body() body: { saveFor?: string | null },
  ) {
    await this.experiences.requireOpenCity(citySlug);
    return this.experiences.save(userId, id, body?.saveFor ?? null);
  }

  @Delete(":id/save")
  @UseGuards(SessionAuthGuard)
  async unsave(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
  ) {
    await this.experiences.requireOpenCity(citySlug);
    return this.experiences.unsave(userId, id);
  }

  @Post(":id/interest")
  @UseGuards(SessionAuthGuard)
  async interest(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
  ) {
    await this.experiences.requireOpenCity(citySlug);
    return this.experiences.interest(userId, id);
  }

  @Delete(":id/interest")
  @UseGuards(SessionAuthGuard)
  async uninterest(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
  ) {
    await this.experiences.requireOpenCity(citySlug);
    return this.experiences.uninterest(userId, id);
  }

  @Post(":id/booking-click")
  @UseGuards(SessionAuthGuard)
  async bookingClick(
    @CurrentUserId() userId: string,
    @Param("citySlug") citySlug: string,
    @Param("id") id: string,
  ) {
    await this.experiences.requireOpenCity(citySlug);
    return this.experiences.bookingClick(userId, id);
  }

  private async viewer(req: Request): Promise<string | null> {
    const token = sessionTokenForRequest(req);
    if (!token) return null;
    return this.sessions.resolveUserId(token);
  }
}
