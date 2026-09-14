import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { z } from "zod";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { createOrderSchema } from "./dto.js";
import { OrdersService } from "./orders.service.js";

@Controller("orders")
@UseGuards(SessionAuthGuard)
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  async create(@CurrentUserId() userId: string, @Body() body: unknown) {
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid order request", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.ordersService.create(userId, parsed.data);
  }

  @Get("mine")
  async mine(@CurrentUserId() userId: string) {
    return this.ordersService.listMine(userId);
  }

  @Get(":orderId")
  async getOne(@CurrentUserId() userId: string, @Param("orderId") orderId: string) {
    return this.ordersService.getById(userId, orderId);
  }

  @Patch(":orderId/lobby")
  async lobbyAction(
    @CurrentUserId() userId: string,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    const parsed = z.object({ action: z.literal("coming_down") }).safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid lobby action");
    }
    return this.ordersService.customerLobbyAction(userId, orderId, parsed.data.action);
  }
}
