import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { CatalogModule } from "./modules/catalog/catalog.module.js";
import { DiscoveryModule } from "./modules/discovery/discovery.module.js";
import { GeoModule } from "./modules/geo/geo.module.js";
import { OrdersModule } from "./modules/orders/orders.module.js";
import { MessagingModule } from "./modules/messaging/messaging.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { ProviderModule } from "./modules/provider/provider.module.js";
import { RunnerModule } from "./modules/runner/runner.module.js";
import { ZonesModule } from "./modules/zones/zones.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    NotificationsModule,
    AdminModule,
    GeoModule,
    ZonesModule,
    CatalogModule,
    DiscoveryModule,
    OrdersModule,
    ProviderModule,
    RunnerModule,
    PaymentsModule,
    MessagingModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
