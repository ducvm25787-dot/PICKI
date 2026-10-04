import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import type { AdminAccess } from "@picki/shared";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CityContentGuard } from "../auth/global-admin.guard.js";
import { CurrentAdmin, CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { experiencePatchSchema, importCommitSchema, importPreviewSchema } from "./dto.js";
import { ExperiencePhotoService } from "./experience-photo.service.js";
import { ExperiencesService } from "./experiences.service.js";

@Controller("admin/experiences")
@UseGuards(SessionAuthGuard, AdminRoleGuard, CityContentGuard)
export class ExperiencesAdminController {
  constructor(
    @Inject(ExperiencesService) private readonly experiences: ExperiencesService,
    @Inject(ExperiencePhotoService) private readonly photos: ExperiencePhotoService,
  ) {}

  @Post("photos")
  async uploadPhoto(@Body() body: { dataUrl?: string }) {
    if (!body?.dataUrl) throw new PickiError("VALIDATION_ERROR", "Thiếu ảnh");
    const url = await this.photos.saveFromDataUrl(body.dataUrl);
    return { url };
  }

  @Post("organizers/:organizerId/members")
  async attachMember(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("organizerId") organizerId: string,
    @Body() body: { phone?: string },
  ) {
    if (!body?.phone?.trim()) throw new PickiError("VALIDATION_ERROR", "Thiếu số điện thoại");
    return this.experiences.attachOrganizerMember(access, userId, organizerId, body.phone);
  }

  @Get()
  async list(@CurrentAdmin() access: AdminAccess, @Query("status") status?: string) {
    return this.experiences.listAdmin(access, status);
  }

  @Post("import/preview")
  async preview(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = importPreviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "JSON import không hợp lệ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.experiences.preview(access, userId, parsed.data.items);
  }

  @Post("import/commit")
  async commit(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = importCommitSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Không ghi được draft", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.experiences.commit(
      access,
      userId,
      parsed.data.items.map((item) => ({
        decision: item.decision,
        experience: item.experience ?? null,
      })),
    );
  }

  @Get(":id")
  async detail(@CurrentAdmin() access: AdminAccess, @Param("id") id: string) {
    return this.experiences.getAdminScoped(access, id);
  }

  @Patch(":id")
  async update(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const parsed = experiencePatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Không lưu được trải nghiệm", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.experiences.update(access, userId, id, parsed.data);
  }

  @Post(":id/publish")
  async publish(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Param("id") id: string) {
    return this.experiences.publish(access, userId, id);
  }

  @Post(":id/reject")
  async reject(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Param("id") id: string) {
    return this.experiences.reject(access, userId, id);
  }

  @Delete(":id")
  async remove(@CurrentAdmin() access: AdminAccess, @CurrentUserId() userId: string, @Param("id") id: string) {
    return this.experiences.removeRejected(access, userId, id);
  }
}
