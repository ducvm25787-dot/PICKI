import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { FulfillmentService } from "./fulfillment.service.js";

@Module({
  imports: [OrdersModule],
  providers: [FulfillmentService],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
