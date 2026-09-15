import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { ClassifiedPhotoService } from "./classified-photo.service.js";
import { ClassifiedsController } from "./classifieds.controller.js";
import { ClassifiedsService } from "./classifieds.service.js";

@Module({
  imports: [AuthModule],
  providers: [ClassifiedsService, ClassifiedPhotoService, OutboxService],
  controllers: [ClassifiedsController],
  exports: [ClassifiedsService],
})
export class ClassifiedsModule {}
