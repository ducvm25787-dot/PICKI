import { Module } from "@nestjs/common";
import { localGeoAdapter } from "../../integrations/geo/local.adapter.js";
import { GEO_ADAPTER } from "../../shared/tokens.js";
import { GeoController } from "./geo.controller.js";
import { GeoService } from "./geo.service.js";
import { PostgisSpatialService } from "./postgis-spatial.service.js";

@Module({
  controllers: [GeoController],
  providers: [
    {
      provide: GEO_ADAPTER,
      useValue: localGeoAdapter,
    },
    PostgisSpatialService,
    GeoService,
  ],
  exports: [GeoService, PostgisSpatialService, GEO_ADAPTER],
})
export class GeoModule {}
