import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { ClassifiedsModule } from "./modules/classifieds/classifieds.module.js";
import { DiscoveryModule } from "./modules/discovery/discovery.module.js";
import { FamilyDinnerModule } from "./modules/family-dinner/family-dinner.module.js";
import { BreakfastPreorderModule } from "./modules/breakfast-preorder/breakfast-preorder.module.js";
import { LateNightModule } from "./modules/late-night/late-night.module.js";
import { GeoModule } from "./modules/geo/geo.module.js";
import { HealthModule } from "./modules/health/health.module.js";
import { AnalyticsModule } from "./modules/analytics/analytics.module.js";
import { ActivityModule } from "./modules/activity/activity.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { MessagingModule } from "./modules/messaging/messaging.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { ProviderModule } from "./modules/provider/provider.module.js";
import { RunnerModule } from "./modules/runner/runner.module.js";
import { ServiceRequestsModule } from "./modules/service-requests/service-requests.module.js";
import { VisitIntentsModule } from "./modules/visit-intents/visit-intents.module.js";
import { ZonesModule } from "./modules/zones/zones.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    AdminModule,
    GeoModule,
    HealthModule,
    ZonesModule,
    CatalogModule,
    ClassifiedsModule,
    DiscoveryModule,
    FamilyDinnerModule,
    BreakfastPreorderModule,
    LateNightModule,
    OrdersModule,
    ProviderModule,
    RunnerModule,
    PaymentsModule,
    MessagingModule,
    ServiceRequestsModule,
    VisitIntentsModule,
    AnalyticsModule,
    ActivityModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
