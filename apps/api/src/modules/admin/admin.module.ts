import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { CampaignAdminService } from "./campaign-admin.service.js";
import { FinanceController } from "./finance.controller.js";
import { FinanceService } from "./finance.service.js";

@Module({
  imports: [AuthModule, OrdersModule],
  controllers: [AdminController, FinanceController],
  providers: [AdminService, CampaignAdminService, FinanceService],
})
export class AdminModule {}
