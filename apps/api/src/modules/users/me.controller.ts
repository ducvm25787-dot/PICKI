import { Body, Controller, Get, Inject, Patch, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { patchMeSchema } from "../auth/dto.js";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AuthService } from "../auth/auth.service.js";
import { UsersService } from "./users.service.js";

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
}
