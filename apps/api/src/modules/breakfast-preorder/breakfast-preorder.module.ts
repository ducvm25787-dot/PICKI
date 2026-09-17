import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BreakfastPreorderController } from "./breakfast-preorder.controller.js";
import { BreakfastPreorderService } from "./breakfast-preorder.service.js";

@Module({
  imports: [AuthModule],
  controllers: [BreakfastPreorderController],
  providers: [BreakfastPreorderService],
  exports: [BreakfastPreorderService],
})
export class BreakfastPreorderModule {}
