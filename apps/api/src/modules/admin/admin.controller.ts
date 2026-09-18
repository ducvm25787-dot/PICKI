import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AdminService } from "./admin.service.js";
import {
  adminOrderActionSchema,
  publishBoundarySchema,
  updateAnchorSchema,
  upsertServiceAreaSchema,
  verifyLocationPinSchema,
} from "./dto.js";

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

  @Get("zones/:zoneId/geo")
  async zoneGeo(@Param("zoneId") zoneId: string) {
    return this.adminService.getZoneGeo(zoneId);
  }

  @Post("zones/:zoneId/boundary")
  async publishBoundary(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = publishBoundarySchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid boundary", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.publishBoundary(userId, zoneId, parsed.data);
  }

  @Post("zones/:zoneId/service-areas")
  async upsertServiceArea(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertServiceAreaSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid service area", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.upsertZoneServiceArea(userId, zoneId, parsed.data);
  }

  @Patch("zones/:zoneId/anchor")
  async updateAnchor(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = updateAnchorSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid anchor", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.updateAnchor(userId, zoneId, parsed.data);
  }

  @Patch("locations/:locationId/pin")
  async verifyPin(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = verifyLocationPinSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid pin", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.verifyLocationPin(userId, locationId, parsed.data);
  }

  @Get("orders")
  async orders(@Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listOrders(Number.isFinite(n) ? n : 50);
  }

  @Get("audit-logs")
  async auditLogs(@Query("limit") limit?: string) {
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listAuditLogs(Number.isFinite(n) ? n : 50);
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
