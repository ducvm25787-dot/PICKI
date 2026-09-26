import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ExperiencesAdminController } from "./experiences.admin.controller.js";
import { ExperiencesController } from "./experiences.controller.js";
import { ExperiencePhotoService } from "./experience-photo.service.js";
import { ExperiencesService } from "./experiences.service.js";

@Module({
  imports: [AuthModule, AnalyticsModule],
  controllers: [ExperiencesAdminController, ExperiencesController],
  providers: [ExperiencesService, ExperiencePhotoService],
})
export class ExperiencesModule {}
