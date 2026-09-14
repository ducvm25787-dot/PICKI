import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FulfillmentModule } from "../fulfillment/fulfillment.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { RunnerController } from "./runner.controller.js";
import { RunnerService } from "./runner.service.js";

@Module({
  imports: [AuthModule, OrdersModule, FulfillmentModule],
  controllers: [RunnerController],
  providers: [RunnerService],
})
export class RunnerModule {}
