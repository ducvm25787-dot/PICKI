import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE_NAME } from "@picki/shared";
import { SessionService } from "./session.service.js";

export type AuthenticatedRequest = Request & { userId: string };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies[SESSION_COOKIE_NAME] as string | undefined;

    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    const userId = await this.sessionService.resolveUserId(token);
    if (!userId) {
      throw new UnauthorizedException("Invalid or expired session");
    }

    (req as AuthenticatedRequest).userId = userId;
    return true;
  }
}
