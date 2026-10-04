import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { userRoles, type PickiDb } from "@picki/db";
import { resolveAdminAccess, type AdminAccess } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import type { AuthenticatedRequest } from "./session-auth.guard.js";

export type AdminRequest = AuthenticatedRequest & { adminAccess: AdminAccess };

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const userId = req.userId;
    if (!userId) {
      throw new ForbiddenException("Admin access required");
    }

    const rows = await this.db
      .select({
        role: userRoles.role,
        scopeType: userRoles.scopeType,
        scopeId: userRoles.scopeId,
      })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));

    const access = resolveAdminAccess(rows);
    if (!access) {
      throw new ForbiddenException("Admin access required");
    }

    req.adminAccess = access;
    return true;
  }
}
