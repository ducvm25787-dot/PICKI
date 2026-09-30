import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { FoodBoardService } from "./food-board.service.js";

const stockSchema = z.object({
  offeringId: z.string().uuid(),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  action: z.enum(["add", "sold_out", "hide", "show", "price"]),
  quantity: z.number().int().positive().max(500).optional(),
  priceVnd: z.number().int().min(0).max(50_000_000).nullable().optional(),
});

const menuStockSchema = z.object({
  channel: z.enum(["breakfast", "dinner"]),
  menuItemId: z.string().uuid(),
  action: z.enum(["add", "sold_out", "hide", "show"]),
  quantity: z.number().int().positive().max(500).optional(),
});

const optionGroupSchema = z.object({
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["SINGLE", "MULTI"]),
  options: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        priceDeltaVnd: z.number().int().min(0).max(5_000_000),
      }),
    )
    .min(1)
    .max(12),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceVnd: z.number().int().min(0).max(50_000_000),
  description: z.string().trim().max(400).nullable().optional(),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  unit: z.enum(["phần", "tô", "đĩa", "ly", "suất", "cái"]).optional(),
  prepTimeMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  optionGroups: z.array(optionGroupSchema).max(4).optional(),
});

const productPatchSchema = productSchema.partial().extend({
  active: z.boolean().optional(),
});

const sellingSchema = z.object({
  capability: z.enum(["SELL_NOW", "BREAKFAST_PREORDER", "FAMILY_DINNER", "LATE_NIGHT"]),
  enabled: z.boolean(),
});

@Controller("provider")
@UseGuards(SessionAuthGuard)
export class FoodBoardController {
  constructor(@Inject(FoodBoardService) private readonly board: FoodBoardService) {}

  @Get("locations/:locationId/board")
  boardOf(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.board.board(userId, locationId);
  }

  @Post("locations/:locationId/board/stock")
  stock(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = stockSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Số lượng không hợp lệ");
    return this.board.stockAction(userId, locationId, parsed.data);
  }

  @Post("locations/:locationId/board/menu-stock")
  menuStock(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = menuStockSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Số lượng không hợp lệ");
    return this.board.menuStockAction(userId, locationId, parsed.data);
  }

  @Post("locations/:locationId/board/copy")
  copy(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.board.copyPrevious(userId, locationId);
  }

  @Get("locations/:locationId/product-categories")
  categories(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.board.listCategories(userId, locationId);
  }

  @Get("locations/:locationId/products")
  products(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.board.listProducts(userId, locationId);
  }

  @Get("locations/:locationId/products/:offeringId")
  product(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("offeringId") offeringId: string,
  ) {
    return this.board.getProduct(userId, locationId, offeringId);
  }

  @Post("locations/:locationId/products")
  createProduct(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Nhập tên và giá");
    return this.board.createProduct(userId, locationId, parsed.data);
  }

  @Patch("locations/:locationId/products/:offeringId")
  updateProduct(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Param("offeringId") offeringId: string,
    @Body() body: unknown,
  ) {
    const parsed = productPatchSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Món không hợp lệ");
    return this.board.updateProduct(userId, locationId, offeringId, parsed.data);
  }

  @Get("locations/:locationId/selling")
  selling(@CurrentUserId() userId: string, @Param("locationId") locationId: string) {
    return this.board.selling(userId, locationId);
  }

  @Patch("locations/:locationId/selling")
  setSelling(
    @CurrentUserId() userId: string,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    const parsed = sellingSchema.safeParse(body);
    if (!parsed.success) throw new PickiError("VALIDATION_ERROR", "Cách bán không hợp lệ");
    return this.board.setSelling(userId, locationId, parsed.data);
  }
}
