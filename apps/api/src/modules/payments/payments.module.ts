import { Module } from "@nestjs/common";
import { createPaymentAdapter } from "../../integrations/payments/index.js";
import { PAYMENT_ADAPTER, PICKI_CONFIG } from "../../shared/tokens.js";
import type { PickiConfig } from "../../shared/config.js";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { SubscriptionLifecycleWorker } from "../../jobs/subscription-lifecycle.worker.js";
import { PaymentsController } from "./payments.controller.js";
import { PayosWebhookController } from "./payments.webhook.controller.js";
import { PaymentsService } from "./payments.service.js";

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [PaymentsController, PayosWebhookController],
  exports: [PaymentsService],
  providers: [
    PaymentsService,
    SubscriptionLifecycleWorker,
    {
      provide: PAYMENT_ADAPTER,
      inject: [PICKI_CONFIG],
      useFactory: (config: PickiConfig) => createPaymentAdapter(config),
    },
  ],
})
export class PaymentsModule {}
