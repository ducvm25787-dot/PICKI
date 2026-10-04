import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { CampaignService } from "./campaign.service.js";
import { ChainConsoleService } from "./chain-console.service.js";

const scopeType = z.enum(["PROVIDER", "CITY", "ZONE", "LOCATION"]);

@Controller("provider/organization")
@UseGuards(SessionAuthGuard)
export class ChainConsoleController {
  constructor(
    @Inject(ChainConsoleService) private readonly chain: ChainConsoleService,
    @Inject(CampaignService) private readonly campaigns: CampaignService,
  ) {}

  @Get("access")
  access(@CurrentUserId() userId: string) {
    return this.chain.access(userId);
  }

  @Get("overview")
  overview(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.overview(userId, scopeTypeValue, scopeId);
  }

  @Get("finance")
  finance(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.finance(userId, scopeTypeValue, scopeId);
  }

  @Get("locations")
  locations(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.locations(userId, scopeTypeValue, scopeId);
  }

  @Get("orders")
  orders(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
    @Query("range") range?: string,
    @Query("status") status?: string,
    @Query("locationId") locationId?: string,
    @Query("vertical") vertical?: string,
  ) {
    return this.chain.orders(userId, scopeTypeValue, scopeId, { range, status, locationId, vertical });
  }

  @Get("products")
  products(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.products(userId, scopeTypeValue, scopeId);
  }

  @Get("products/:offeringId")
  product(
    @CurrentUserId() userId: string,
    @Param("offeringId") offeringId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.product(userId, offeringId, scopeTypeValue, scopeId);
  }

  @Post("products")
  createProduct(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
        imageUrl: z.string().trim().max(500).optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Nhập tên sản phẩm");
    return this.chain.createProduct(userId, parsed.data, scopeTypeValue, scopeId);
  }

  @Patch("products/:offeringId")
  updateProduct(
    @CurrentUserId() userId: string,
    @Param("offeringId") offeringId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(500).optional(),
        imageUrl: z.string().trim().max(500).optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Nội dung sản phẩm không hợp lệ");
    return this.chain.updateProduct(userId, offeringId, parsed.data, scopeTypeValue, scopeId);
  }

  @Post("products/:offeringId/locations/:locationId/price")
  setPrice(
    @CurrentUserId() userId: string,
    @Param("offeringId") offeringId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z.object({ priceVnd: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Giá không hợp lệ");
    return this.chain.setPrice(userId, offeringId, locationId, parsed.data.priceVnd, scopeTypeValue, scopeId);
  }

  @Post("products/:offeringId/locations/:locationId/stock")
  setStock(
    @CurrentUserId() userId: string,
    @Param("offeringId") offeringId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z.object({ quantity: z.number().int().positive() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Số lượng không hợp lệ");
    return this.chain.setStock(userId, offeringId, locationId, parsed.data.quantity, scopeTypeValue, scopeId);
  }

  @Post("products/:offeringId/locations/:locationId/availability")
  setAvailability(
    @CurrentUserId() userId: string,
    @Param("offeringId") offeringId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z.object({ action: z.enum(["sold_out", "hide", "show"]) }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Trạng thái không hợp lệ");
    return this.chain.setAvailability(userId, offeringId, locationId, parsed.data.action, scopeTypeValue, scopeId);
  }

  @Get("today")
  today(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.today(userId, scopeTypeValue, scopeId);
  }

  @Get("members")
  members(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.members(userId, scopeTypeValue, scopeId);
  }

  @Post("members")
  addMember(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z
      .object({
        phone: z.string().trim().min(8).max(20),
        role: z.enum(["OWNER", "MANAGER", "STAFF"]),
        scopeType,
        scopeId: z.string().uuid(),
      })
      .safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Thiếu thông tin người dùng");
    return this.chain.addMember(userId, parsed.data, scopeTypeValue, scopeId);
  }

  @Get("campaigns")
  campaignsList(
    @CurrentUserId() userId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
    @Query("status") status?: string,
  ) {
    return this.campaigns.list(userId, scopeTypeValue, scopeId, status);
  }

  @Post("campaigns")
  createCampaign(
    @CurrentUserId() userId: string,
    @Body() body: unknown,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    const parsed = z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).optional(),
        campaignType: z.enum(["HERO_PRODUCT", "TODAY_FEATURE", "PRICE_PROMOTION", "DELIVERY_SUBSIDY", "CONTENT_CAMPAIGN"]),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        targets: z.array(z.object({ targetType: scopeType, targetId: z.string().uuid() })).min(1),
        items: z.array(z.object({
          offeringId: z.string().uuid().nullable(),
          campaignPrice: z.number().int().nonnegative().nullable().optional(),
          discountAmount: z.number().int().nonnegative().nullable().optional(),
          discountPercent: z.number().int().min(1).max(99).nullable().optional(),
          heroPriority: z.number().int().nullable().optional(),
        })).min(1),
        submit: z.boolean().optional(),
      })
      .safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Thiếu thông tin chương trình");
    return this.campaigns.create(userId, parsed.data, scopeTypeValue, scopeId);
  }

  @Patch("campaigns/:campaignId")
  editCampaign(@CurrentUserId() userId: string, @Param("campaignId") campaignId: string, @Body() body: unknown) {
    const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), description: z.string().max(500).nullable().optional() }).safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Nội dung không hợp lệ");
    return this.campaigns.edit(userId, campaignId, parsed.data);
  }

  @Post("campaigns/:campaignId/submit")
  submitCampaign(@CurrentUserId() userId: string, @Param("campaignId") campaignId: string) {
    return this.campaigns.submit(userId, campaignId);
  }

  @Post("campaigns/:campaignId/pause")
  pauseCampaign(@CurrentUserId() userId: string, @Param("campaignId") campaignId: string, @Body() body: unknown) {
    const parsed = z.object({ resume: z.boolean().optional() }).safeParse(body ?? {});
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Không tạm dừng được");
    return this.campaigns.pause(userId, campaignId, parsed.data.resume === true);
  }

  @Delete("members/:memberId")
  removeMember(
    @CurrentUserId() userId: string,
    @Param("memberId") memberId: string,
    @Query("scopeType") scopeTypeValue?: string,
    @Query("scopeId") scopeId?: string,
  ) {
    return this.chain.removeMember(userId, memberId, scopeTypeValue, scopeId);
  }
}
