import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { RunnerDispatchService } from "../runner/runner-dispatch.service.js";
import { ProviderController } from "./provider.controller.js";
import { ProviderService } from "./provider.service.js";

@Module({
  imports: [AuthModule, OrdersModule, NotificationsModule],
  controllers: [ProviderController],
  providers: [ProviderService, RunnerDispatchService],
})
export class ProviderModule {}
