import { Body, Controller, Get, Inject, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AdminService } from "./admin.service.js";
import { adminOrderActionSchema } from "./dto.js";

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("dashboard")
  async dashboard() {
    return this.adminService.dashboard();
  }

  @Get("zones")
  async zones() {
    return this.adminService.listZones();
  }

  @Get("orders")
  async orders(@Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listOrders(Number.isFinite(n) ? n : 50);
  }

  @Patch("orders/:orderId")
  async orderAction(
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = adminOrderActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.applyOrderAction(userId, orderId, parsed.data);
  }
}
