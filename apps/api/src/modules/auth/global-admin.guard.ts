import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { canReadAnyCity, canWriteAnyCity } from "@picki/shared";
import type { AdminRequest } from "./admin-role.guard.js";

/** City content: banners and experiences. Reads need a city grant, unscoped support, or super admin. */
@Injectable()
export class CityContentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const access = req.adminAccess;
    if (!access) throw new ForbiddenException("Admin access required");
    const read = req.method === "GET" || req.method === "HEAD";
    if (read ? canReadAnyCity(access) : canWriteAnyCity(access)) return true;
    throw new ForbiddenException(
      read
        ? "Nội dung thành phố không mở cho Zone admin"
        : "Không có quyền sửa nội dung thành phố",
    );
  }
}
