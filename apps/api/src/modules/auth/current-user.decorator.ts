import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AdminAccess } from "@picki/shared";
import type { AdminRequest } from "./admin-role.guard.js";
import type { AuthenticatedRequest } from "./session-auth.guard.js";

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return req.userId;
  },
);

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminAccess => {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    return req.adminAccess;
  },
);
