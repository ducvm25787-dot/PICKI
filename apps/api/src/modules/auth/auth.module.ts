import { Module } from "@nestjs/common";
import { MeController } from "../users/me.controller.js";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { OtpService } from "./otp.service.js";
import { AdminRoleGuard } from "./admin-role.guard.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { SessionService } from "./session.service.js";

@Module({
  imports: [UsersModule],
  controllers: [AuthController, MeController],
  providers: [AuthService, OtpService, SessionService, SessionAuthGuard, AdminRoleGuard],
  exports: [SessionService, SessionAuthGuard, AdminRoleGuard],
})
export class AuthModule {}
