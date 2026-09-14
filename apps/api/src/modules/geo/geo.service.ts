import { Inject, Injectable } from "@nestjs/common";
import { checkPostgis } from "@picki/db";
import type { GeoAdapter, GeoPoint, LatLng } from "@picki/shared";
import { haversineMeters } from "@picki/shared";
import type { PickiSql } from "@picki/db";
import { GEO_ADAPTER, PICKI_SQL } from "../../shared/tokens.js";
import { PostgisSpatialService } from "./postgis-spatial.service.js";

export type GeoStatus = {
  postgisVersion: string;
  routingProvider: string;
};

export type DistanceResult = {
  meters: number;
  source: "postgis";
};

export type EtaResult = {
  seconds: number | null;
  source: "adapter" | "haversine_fallback" | "unknown";
  routingProvider: string;
};

@Injectable()
export class GeoService {
  constructor(
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(GEO_ADAPTER) private readonly geoAdapter: GeoAdapter,
    @Inject(PostgisSpatialService) private readonly spatial: PostgisSpatialService,
  ) {}

  async status(): Promise<GeoStatus> {
    const postgisVersion = await checkPostgis(this.sql);
    return {
      postgisVersion,
      routingProvider: this.geoAdapter.providerKey,
    };
  }

  async distance(from: LatLng, to: LatLng): Promise<DistanceResult> {
    const meters = await this.spatial.distance(from, to);
    return { meters, source: "postgis" };
  }

  async contains(geometryWkt: string, point: LatLng): Promise<boolean> {
    await this.spatial.validateGeometryWkt(geometryWkt);
    return this.spatial.contains(geometryWkt, point);
  }

  async geocode(query: string): Promise<GeoPoint | null> {
    return this.geoAdapter.geocode(query);
  }

  async reverseGeocode(point: LatLng): Promise<string | null> {
    return this.geoAdapter.reverseGeocode(point);
  }

  async eta(from: LatLng, to: LatLng): Promise<EtaResult> {
    const adapterEta = await this.geoAdapter.routeEtaSeconds(from, to);
    if (adapterEta !== null) {
      return {
        seconds: adapterEta,
        source: "adapter",
        routingProvider: this.geoAdapter.providerKey,
      };
    }

    const meters = haversineMeters(from, to);
    const fallbackSeconds = Math.max(60, Math.round(meters / 8.33));
    return {
      seconds: fallbackSeconds,
      source: "haversine_fallback",
      routingProvider: this.geoAdapter.providerKey,
    };
  }

  async navigationLink(from: LatLng, to: LatLng): Promise<string | null> {
    if (this.geoAdapter.navigationLink) {
      return this.geoAdapter.navigationLink(from, to);
    }
    return null;
  }
}
