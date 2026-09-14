import { Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { PaymentsService } from "./payments.service.js";

@Controller("payments")
@UseGuards(SessionAuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Post("orders/:orderId/intent")
  async intent(@CurrentUserId() userId: string, @Param("orderId") orderId: string) {
    return this.paymentsService.createPaymentIntent(userId, orderId);
  }

  @Get(":paymentId")
  async status(@CurrentUserId() userId: string, @Param("paymentId") paymentId: string) {
    return this.paymentsService.getPaymentStatus(userId, paymentId);
  }

  @Post(":paymentId/dev-confirm")
  async devConfirm(@CurrentUserId() userId: string, @Param("paymentId") paymentId: string) {
    return this.paymentsService.devConfirm(paymentId, userId);
  }
}
