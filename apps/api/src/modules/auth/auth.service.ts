import { Inject, Injectable } from "@nestjs/common";
import { PickiError, type AuthUserDto } from "@picki/shared";
import { normalizeEmail, normalizePhone } from "../../shared/crypto.js";
import { UsersService } from "../users/users.service.js";
import { OtpService } from "./otp.service.js";
import { SessionService } from "./session.service.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(OtpService) private readonly otpService: OtpService,
    @Inject(SessionService) private readonly sessionService: SessionService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  requestPhoneOtp(rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    return this.otpService.requestPhoneOtp(phone);
  }

  requestEmailOtp(rawEmail: string) {
    const email = normalizeEmail(rawEmail);
    return this.otpService.requestEmailOtp(email);
  }

  async verifyPhoneOtp(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    await this.otpService.verify(phone, code);
    const user = await this.usersService.findOrCreateByIdentity("PHONE", phone);
    const session = await this.sessionService.create(user.id);
    const me = await this.usersService.toAuthDto(user);
    return { session, me };
  }

  async verifyEmailOtp(rawEmail: string, code: string) {
    const email = normalizeEmail(rawEmail);
    await this.otpService.verify(email, code);
    const user = await this.usersService.findOrCreateByIdentity("EMAIL", email);
    const session = await this.sessionService.create(user.id);
    const me = await this.usersService.toAuthDto(user);
    return { session, me };
  }

  async logout(token: string): Promise<void> {
    await this.sessionService.revoke(token);
  }

  async getMe(userId: string): Promise<AuthUserDto> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new PickiError("NOT_FOUND", "User not found");
    }
    return this.usersService.toAuthDto(user);
  }
}
