import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
@UseGuards(SessionAuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Get("plans")
  async plans() {
    return this.paymentsService.listPlans();
  }

  @Post("orders/:orderId/intent")
  async intent(@CurrentUserId() userId: string, @Param("orderId") orderId: string) {
    return this.paymentsService.createPaymentIntent(userId, orderId);
  }

  @Get(":paymentId")
  async status(@CurrentUserId() userId: string, @Param("paymentId") paymentId: string) {
    return this.paymentsService.getPaymentStatus(userId, paymentId);
  }

  @Get("subscription")
  async subscription(@CurrentUserId() userId: string, @Query("providerId") providerId: string) {
    return this.paymentsService.subscriptionState(userId, providerId);
  }

  @Post("subscription/checkout")
  async checkout(
    @CurrentUserId() userId: string,
    @Body() body: { planPriceId?: string; providerId?: string },
  ) {
    if (!body.planPriceId || !body.providerId) {
      throw new PickiError("VALIDATION_ERROR", "Chọn gói và quán");
    }
    return this.paymentsService.beginSubscriptionCheckout(userId, body.planPriceId, body.providerId);
  }

  @Post("billing/:paymentId/dev-confirm")
  async devConfirmBilling(@CurrentUserId() userId: string, @Param("paymentId") paymentId: string) {
    return this.paymentsService.devConfirmBilling(userId, paymentId);
  }

  @Post(":paymentId/dev-confirm")
  async devConfirm(@CurrentUserId() userId: string, @Param("paymentId") paymentId: string) {
    return this.paymentsService.devConfirm(paymentId, userId);
  }
}
