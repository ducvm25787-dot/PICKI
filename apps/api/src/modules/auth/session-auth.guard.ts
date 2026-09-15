import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import {
  isPickiAppRole,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAMES,
  sessionCookieForApiPath,
  type PickiAppRole,
} from "@picki/shared";
import { SessionService } from "./session.service.js";

export type AuthenticatedRequest = Request & { userId: string };

function resolveAppRole(req: Request): PickiAppRole {
  const header = req.headers["x-picki-app"];
  if (typeof header === "string" && isPickiAppRole(header)) {
    return header;
  }
  const path = req.path ?? req.url ?? "";
  if (path.startsWith("/v1/provider")) return "provider";
  if (path.startsWith("/v1/runner")) return "runner";
  if (path.startsWith("/v1/admin")) return "admin";
  return "customer";
}

function sessionTokenForRequest(req: Request): string | undefined {
  const role = resolveAppRole(req);
  const primary = SESSION_COOKIE_NAMES[role];
  const primaryToken = req.cookies[primary] as string | undefined;
  if (primaryToken) return primaryToken;

  // Shared routes (/v1/notifications, /v1/messages) — try role cookie from header first above
  const pathCookie = sessionCookieForApiPath(req.path ?? "");
  if (pathCookie !== primary) {
    const alt = req.cookies[pathCookie] as string | undefined;
    if (alt) return alt;
  }

  // Legacy single-cookie installs (customer only)
  if (role === "customer") {
    return req.cookies[SESSION_COOKIE_NAME] as string | undefined;
  }

  return undefined;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = sessionTokenForRequest(req);

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
