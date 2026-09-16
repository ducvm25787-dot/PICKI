import { Module } from "@nestjs/common";
import { AddressesModule } from "../addresses/addresses.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrderTransitionService } from "./order-transition.service.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [AuthModule, AddressesModule, NotificationsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderTransitionService],
  exports: [OrdersService, OrderTransitionService],
})
export class OrdersModule {}
