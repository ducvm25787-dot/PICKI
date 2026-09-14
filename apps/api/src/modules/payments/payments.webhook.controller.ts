import { Body, Controller, Inject, Post } from "@nestjs/common";
import { PaymentsService } from "./payments.service.js";

@Controller("integrations/payos")
export class PayosWebhookController {
  constructor(@Inject(PaymentsService) private readonly paymentsService: PaymentsService) {}

  @Post("webhooks")
  async webhook(@Body() body: unknown) {
    return this.paymentsService.handlePayosWebhook(body);
  }
}
