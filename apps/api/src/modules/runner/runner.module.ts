import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FulfillmentModule } from "../fulfillment/fulfillment.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { RunnerController } from "./runner.controller.js";
import { RunnerDispatchService } from "./runner-dispatch.service.js";
import { RunnerService } from "./runner.service.js";

@Module({
  imports: [AuthModule, OrdersModule, FulfillmentModule, NotificationsModule],
  controllers: [RunnerController],
  providers: [RunnerService, RunnerDispatchService],
  exports: [RunnerDispatchService],
})
export class RunnerModule {}
