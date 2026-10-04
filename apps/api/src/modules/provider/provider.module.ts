import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { RunnerDispatchService } from "../runner/runner-dispatch.service.js";
import { CampaignService } from "./campaign.service.js";
import { ChainConsoleController } from "./chain-console.controller.js";
import { ChainConsoleService } from "./chain-console.service.js";
import { FoodBoardController } from "./food-board.controller.js";
import { FoodBoardService } from "./food-board.service.js";
import { ProviderController } from "./provider.controller.js";
import { ProviderService } from "./provider.service.js";

@Module({
  imports: [AuthModule, OrdersModule, NotificationsModule],
  controllers: [ProviderController, FoodBoardController, ChainConsoleController],
  providers: [ProviderService, FoodBoardService, ChainConsoleService, CampaignService, RunnerDispatchService],
})
export class ProviderModule {}
