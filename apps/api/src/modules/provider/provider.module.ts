import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { ProviderController } from "./provider.controller.js";
import { ProviderService } from "./provider.service.js";

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [ProviderController],
  providers: [ProviderService],
})
export class ProviderModule {}
