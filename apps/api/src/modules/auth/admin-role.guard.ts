import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { userRoles, type PickiDb } from "@picki/db";
import { PICKI_DB } from "../../shared/tokens.js";
import type { AuthenticatedRequest } from "./session-auth.guard.js";

const ADMIN_ROLES = ["ZONE_ADMIN", "SUPER_ADMIN", "SUPPORT"] as const;

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = req.userId;
    if (!userId) {
      throw new ForbiddenException("Admin access required");
    }

    const rows = await this.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), inArray(userRoles.role, [...ADMIN_ROLES])))
      .limit(1);

    if (rows.length === 0) {
      throw new ForbiddenException("Admin access required");
    }

    return true;
  }
}
