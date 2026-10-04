import { Body, Controller, Get, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PickiError } from "@picki/shared";
import { avatarUploadSchema, patchMeSchema } from "../auth/dto.js";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { saveUserAvatar } from "./avatar.js";
import { UsersService } from "./users.service.js";

const zAge = z.object({
  fullName: z.string().trim().min(2).max(80),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@Controller("me")
@UseGuards(SessionAuthGuard)
export class MeController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  @Get()
  async getMe(@CurrentUserId() userId: string) {
    return this.authService.getMe(userId);
  }

  @Patch()
  async patchMe(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = patchMeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid profile update", {
        details: { issues: parsed.error.issues },
      });
    }

    const user = await this.usersService.updateProfile(userId, parsed.data);
    return this.usersService.toAuthDto(user);
  }

  @Post("age-declaration")
  async declareAge(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = zAge.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Nhập họ tên và ngày sinh");
    }
    const user = await this.usersService.declareDraftBeerAge(userId, parsed.data);
    return this.usersService.toAuthDto(user);
  }

  @Post("avatar")
  async uploadAvatar(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = avatarUploadSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Ảnh không hợp lệ");
    }
    const avatarUrl = await saveUserAvatar(parsed.data.dataUrl);
    const user = await this.usersService.updateProfile(userId, { avatarUrl });
    return this.usersService.toAuthDto(user);
  }
}
