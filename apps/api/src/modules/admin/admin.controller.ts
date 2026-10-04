import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { canReadGlobal, canReadZone, PickiError, type AdminAccess } from "@picki/shared";
import { AdminRoleGuard } from "../auth/admin-role.guard.js";
import { CurrentAdmin, CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AdminService } from "./admin.service.js";
import {
  adminOrderActionSchema,
  createDeliveryPromotionSchema,
  publishBoundarySchema,
  issueLocationQrSchema,
  setLocationVerificationSchema,
  updateAnchorSchema,
  upsertServiceAreaSchema,
  verifyLocationPinSchema,
  upsertZonePlaceSchema,
  homeHeroImageSchema,
  saveHomeHeroSchema,
} from "./dto.js";

@Controller("admin")
@UseGuards(SessionAuthGuard, AdminRoleGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("session")
  async session(@CurrentAdmin() access: AdminAccess) {
    return this.adminService.session(access);
  }

  @Get("dashboard")
  async dashboard(@CurrentAdmin() access: AdminAccess) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    return this.adminService.dashboard();
  }

  @Get("accounts")
  async accounts(@CurrentAdmin() access: AdminAccess) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    return this.adminService.listAccounts();
  }

  @Get("runners")
  async runners(@CurrentAdmin() access: AdminAccess) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    return this.adminService.listRunners();
  }

  @Get("runners/:runnerId/documents/:kind")
  async runnerDocument(
    @CurrentAdmin() access: AdminAccess,
    @Param("runnerId") runnerId: string,
    @Param("kind") kind: string,
  ) {
    return this.adminService.runnerDocument(access, runnerId, kind);
  }

  @Patch("runners/:runnerId/operations")
  async setRunnerOperations(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("runnerId") runnerId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ paused: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Không đổi được trạng thái tài xế");
    return this.adminService.setRunnerOperations(access, userId, runnerId, parsed.data.paused);
  }

  @Get("shops")
  async shops(@CurrentAdmin() access: AdminAccess) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    return this.adminService.listShops();
  }

  @Get("zones")
  async zones(@CurrentAdmin() access: AdminAccess) {
    const data = await this.adminService.listZones();
    if (canReadGlobal(access)) return data;
    return { zones: data.zones.filter((zone) => canReadZone(access, zone.id)) };
  }

  @Get("zones/:zoneId/geo")
  async zoneGeo(@CurrentAdmin() access: AdminAccess, @Param("zoneId") zoneId: string) {
    return this.adminService.getZoneGeo(access, zoneId);
  }

  @Get("zones/:zoneId/places")
  async zonePlaces(@CurrentAdmin() access: AdminAccess, @Param("zoneId") zoneId: string) {
    return this.adminService.listZonePlaces(access, zoneId);
  }

  @Post("zones/:zoneId/places")
  async upsertZonePlace(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = upsertZonePlaceSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Thông tin tòa / khu chưa hợp lệ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.upsertZonePlace(access, userId, zoneId, parsed.data);
  }

  @Post("zones/:zoneId/places/:placeId/archive")
  async archiveZonePlace(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Param("placeId") placeId: string,
  ) {
    return this.adminService.archiveZonePlace(access, userId, zoneId, placeId);
  }

  @Post("zones/:zoneId/boundary")
  async publishBoundary(
    @CurrentAdmin() access: AdminAccess,
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
    return this.adminService.publishBoundary(access, userId, zoneId, parsed.data);
  }

  @Post("zones/:zoneId/service-areas")
  async upsertServiceArea(
    @CurrentAdmin() access: AdminAccess,
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
    return this.adminService.upsertZoneServiceArea(access, userId, zoneId, parsed.data);
  }

  @Patch("zones/:zoneId/anchor")
  async updateAnchor(
    @CurrentAdmin() access: AdminAccess,
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
    return this.adminService.updateAnchor(access, userId, zoneId, parsed.data);
  }

  @Patch("locations/:locationId/pin")
  async verifyPin(
    @CurrentAdmin() access: AdminAccess,
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
    return this.adminService.verifyLocationPin(access, userId, locationId, parsed.data);
  }

  @Patch("locations/:locationId/verification")
  async setVerification(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = setLocationVerificationSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Trạng thái xác minh không hợp lệ");
    }
    return this.adminService.setLocationVerification(access, userId, locationId, parsed.data);
  }

  @Patch("locations/:locationId/operations")
  async setOperations(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ paused: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Không đổi được trạng thái quán");
    return this.adminService.setLocationOperations(access, userId, locationId, parsed.data.paused);
  }

  @Patch("locations/:locationId/draft-beer")
  async setDraftBeer(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ enabled: z.boolean(), note: z.string().max(200).optional() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Bật hoặc tắt bia hơi");
    return this.adminService.setDraftBeer(access, userId, locationId, parsed.data);
  }

  @Post("locations/:locationId/verified-qr")
  async issueQr(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = issueLocationQrSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Lý do cấp QR không hợp lệ");
    }
    return this.adminService.issueLocationQr(access, userId, locationId, parsed.data);
  }

  @Get("orders")
  async orders(@CurrentAdmin() access: AdminAccess, @Query("limit") limit?: string) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listOrders(Number.isFinite(n) ? n : 50);
  }

  @Get("delivery-promotions")
  async listDeliveryPromotions(@Query("zoneId") zoneId?: string) {
    return this.adminService.listDeliveryPromotions(zoneId);
  }

  @Post("delivery-promotions")
  async createDeliveryPromotion(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const parsed = createDeliveryPromotionSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid delivery promotion", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.createDeliveryPromotion(access, userId, parsed.data);
  }

  @Get("home-hero")
  async listHomeHero(@CurrentAdmin() access: AdminAccess) {
    return this.adminService.listHomeHero(access);
  }

  @Put("home-hero")
  async saveHomeHero(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const parsed = saveHomeHeroSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Ảnh banner không hợp lệ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.saveHomeHero(access, userId, parsed.data);
  }

  @Post("home-hero")
  async addHomeHero(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const parsed = homeHeroImageSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Ảnh banner không hợp lệ", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.adminService.addHomeHero(access, userId, parsed.data);
  }

  @Delete("home-hero/:imageId")
  async removeHomeHero(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("imageId") imageId: string,
  ) {
    return this.adminService.removeHomeHero(access, userId, imageId);
  }

  @Get("reviews")
  async reviews(@CurrentAdmin() access: AdminAccess) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Chỉ xem được trong khu vực được cấp");
    return this.adminService.listReviews();
  }

  @Post("reviews/spotlights/:updateId/approve")
  async approveSpotlight(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ approvedSurface: z.enum(["SPECIAL_TODAY", "SNACK_DESSERT", "MARKET_TODAY"]).optional() })
      .safeParse(body ?? {});
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Mục trang chủ không hợp lệ");
    return this.adminService.reviewSpotlight(access, userId, updateId, true, parsed.data.approvedSurface);
  }

  @Post("reviews/spotlights/:updateId/reject")
  async rejectSpotlight(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("updateId") updateId: string,
  ) {
    return this.adminService.reviewSpotlight(access, userId, updateId, false);
  }

  @Get("audit-logs")
  async auditLogs(@CurrentAdmin() access: AdminAccess, @Query("limit") limit?: string) {
    if (!canReadGlobal(access)) throw new PickiError("FORBIDDEN", "Nhật ký toàn hệ thống không mở cho Zone admin");
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listAuditLogs(Number.isFinite(n) ? n : 50);
  }

  @Patch("orders/:orderId")
  async orderAction(
    @CurrentAdmin() access: AdminAccess,
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
    return this.adminService.applyOrderAction(access, userId, orderId, parsed.data);
  }

  @Get("zones/:zoneKey/overview")
  async zoneOverview(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    const zone = await this.adminService.readZone(access, zoneKey);
    const stats = await this.adminService.dashboard(zone.id);
    return { zone: { id: zone.id, slug: zone.slug, displayName: zone.displayName, status: zone.status }, ...stats };
  }

  @Get("zones/:zoneKey/accounts")
  async zoneAccounts(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    const zone = await this.adminService.readZone(access, zoneKey);
    return this.adminService.listAccounts(zone.id);
  }

  @Get("zones/:zoneKey/shops")
  async zoneShops(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    const zone = await this.adminService.readZone(access, zoneKey);
    return this.adminService.listShops(zone.id);
  }

  @Get("zones/:zoneKey/runners")
  async zoneRunners(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    const zone = await this.adminService.readZone(access, zoneKey);
    return this.adminService.listRunners(zone.id);
  }

  @Get("zones/:zoneKey/reviews")
  async zoneReviews(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    const zone = await this.adminService.readZone(access, zoneKey);
    return this.adminService.listReviews(zone.id);
  }

  @Get("zones/:zoneKey/orders")
  async zoneOrders(
    @CurrentAdmin() access: AdminAccess,
    @Param("zoneKey") zoneKey: string,
    @Query("limit") limit?: string,
  ) {
    const zone = await this.adminService.readZone(access, zoneKey);
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listOrders(Number.isFinite(n) ? n : 50, zone.id);
  }

  @Patch("zones/:zoneKey/orders/:orderId")
  async zoneOrderAction(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    await this.adminService.readZone(access, zoneKey);
    const parsed = adminOrderActionSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Invalid action");
    return this.adminService.applyOrderAction(access, userId, orderId, parsed.data, zoneKey);
  }

  @Get("zones/:zoneKey/logs")
  async zoneLogs(
    @CurrentAdmin() access: AdminAccess,
    @Param("zoneKey") zoneKey: string,
    @Query("limit") limit?: string,
  ) {
    const zone = await this.adminService.readZone(access, zoneKey);
    const n = limit ? Number.parseInt(limit, 10) : 50;
    return this.adminService.listAuditLogs(Number.isFinite(n) ? n : 50, zone.id);
  }

  @Get("zones/:zoneKey/settings")
  async zoneSettings(@CurrentAdmin() access: AdminAccess, @Param("zoneKey") zoneKey: string) {
    return this.adminService.getZoneSettings(access, zoneKey);
  }

  @Put("zones/:zoneKey/settings")
  async saveZoneSettings(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({
        notes: z.string().max(500).default(""),
        batchWaitWindowMinutes: z.number().int().min(0).max(120),
        maxBatchOrders: z.number().int().min(1).max(20),
        maxRouteDetourMeters: z.number().int().min(0).max(5000),
        foodDeliveryFeeVnd: z.number().int().min(0),
        foodDoorDeliveryFeeVnd: z.number().int().min(0),
        laundryReturnRunnerFeeVnd: z.number().int().min(0),
      })
      .safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Cấu hình khu vực chưa hợp lệ");
    return this.adminService.saveZoneSettings(access, userId, zoneKey, parsed.data);
  }

  @Patch("zones/:zoneKey/locations/:locationId/operations")
  async zoneLocationOperations(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ paused: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Không đổi được trạng thái quán");
    return this.adminService.setLocationOperations(access, userId, locationId, parsed.data.paused, zoneKey);
  }

  @Patch("zones/:zoneKey/locations/:locationId/verification")
  async zoneLocationVerification(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = setLocationVerificationSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Trạng thái xác minh không hợp lệ");
    return this.adminService.setLocationVerification(access, userId, locationId, parsed.data, zoneKey);
  }

  @Post("zones/:zoneKey/locations/:locationId/verified-qr")
  async zoneLocationQr(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = issueLocationQrSchema.safeParse(body ?? {});
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Lý do cấp QR không hợp lệ");
    return this.adminService.issueLocationQr(access, userId, locationId, parsed.data, zoneKey);
  }

  @Patch("zones/:zoneKey/runners/:runnerId/operations")
  async zoneRunnerOperations(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("runnerId") runnerId: string,
    @Body() body: unknown,
  ) {
    await this.adminService.readZone(access, zoneKey);
    const parsed = z.object({ paused: z.boolean() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Không đổi được trạng thái tài xế");
    return this.adminService.setRunnerOperations(access, userId, runnerId, parsed.data.paused, zoneKey);
  }

  @Post("zones/:zoneKey/reviews/spotlights/:updateId/approve")
  async zoneApproveSpotlight(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("updateId") updateId: string,
    @Body() body: unknown,
  ) {
    const parsed = z
      .object({ approvedSurface: z.enum(["SPECIAL_TODAY", "SNACK_DESSERT", "MARKET_TODAY"]).optional() })
      .safeParse(body ?? {});
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Mục trang chủ không hợp lệ");
    return this.adminService.reviewSpotlight(access, userId, updateId, true, parsed.data.approvedSurface, zoneKey);
  }

  @Post("zones/:zoneKey/reviews/spotlights/:updateId/reject")
  async zoneRejectSpotlight(
    @CurrentAdmin() access: AdminAccess,
    @CurrentUserId() userId: string,
    @Param("zoneKey") zoneKey: string,
    @Param("updateId") updateId: string,
  ) {
    return this.adminService.reviewSpotlight(access, userId, updateId, false, undefined, zoneKey);
  }
}
