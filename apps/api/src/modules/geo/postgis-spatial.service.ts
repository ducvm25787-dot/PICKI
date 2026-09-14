import { Inject, Injectable } from "@nestjs/common";
import {
  assertValidGeometryWkt,
  containsPoint,
  distanceMeters,
  pointWithinGeometry,
} from "@picki/db";
import type { PickiSql } from "@picki/db";
import type { LatLng } from "@picki/shared";
import { PICKI_SQL } from "../../shared/tokens.js";

@Injectable()
export class PostgisSpatialService {
  constructor(@Inject(PICKI_SQL) private readonly sql: PickiSql) {}

  distance(from: LatLng, to: LatLng): Promise<number> {
    return distanceMeters(this.sql, from, to);
  }

  contains(geometryWkt: string, point: LatLng): Promise<boolean> {
    return containsPoint(this.sql, geometryWkt, point);
  }

  within(geometryWkt: string, point: LatLng): Promise<boolean> {
    return pointWithinGeometry(this.sql, geometryWkt, point);
  }

  validateGeometryWkt(geometryWkt: string): Promise<void> {
    return assertValidGeometryWkt(this.sql, geometryWkt);
  }
}
