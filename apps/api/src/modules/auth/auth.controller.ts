import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { PickiError, SESSION_COOKIE_NAME } from "@picki/shared";
import type { PickiConfig } from "../../shared/config.js";
import { PICKI_CONFIG } from "../../shared/tokens.js";
import { AuthService } from "./auth.service.js";
import {
  emailOtpRequestSchema,
  emailOtpVerifySchema,
  phoneOtpRequestSchema,
  phoneOtpVerifySchema,
} from "./dto.js";
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
  ) {}

  @Post("otp/request")
  @HttpCode(200)
  async requestPhoneOtp(@Body() body: unknown) {
    const parsed = phoneOtpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid phone number", {
        details: { issues: parsed.error.issues },
      });
    }
    const result = await this.authService.requestPhoneOtp(parsed.data.phone);
    return {
      channel: "PHONE",
      expiresAt: result.expiresAt.toISOString(),
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  @Post("otp/verify")
  @HttpCode(200)
  async verifyPhoneOtp(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = phoneOtpVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid request", {
        details: { issues: parsed.error.issues },
      });
    }

    try {
      const { session, me } = await this.authService.verifyPhoneOtp(
        parsed.data.phone,
        parsed.data.code,
      );
      this.setSessionCookie(res, session.token, session.expiresAt);
      return { user: me };
    } catch (err) {
      if (err instanceof PickiError && err.code === "UNAUTHORIZED") {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  @Post("email/request")
  @HttpCode(200)
  async requestEmailOtp(@Body() body: unknown) {
    const parsed = emailOtpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid email", {
        details: { issues: parsed.error.issues },
      });
    }
    const result = await this.authService.requestEmailOtp(parsed.data.email);
    return {
      channel: "EMAIL",
      expiresAt: result.expiresAt.toISOString(),
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  @Post("email/verify")
  @HttpCode(200)
  async verifyEmailOtp(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const parsed = emailOtpVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid request", {
        details: { issues: parsed.error.issues },
      });
    }

    try {
      const { session, me } = await this.authService.verifyEmailOtp(
        parsed.data.email,
        parsed.data.code,
      );
      this.setSessionCookie(res, session.token, session.expiresAt);
      return { user: me };
    } catch (err) {
      if (err instanceof PickiError && err.code === "UNAUTHORIZED") {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies[SESSION_COOKIE_NAME] as string | undefined;
    if (token) {
      await this.authService.logout(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions(new Date(0)));
  }

  private setSessionCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE_NAME, token, this.cookieOptions(expiresAt));
  }

  private cookieOptions(expires: Date) {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.config.nodeEnv === "production",
      expires,
      path: "/",
    };
  }
}
