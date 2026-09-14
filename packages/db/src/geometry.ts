import { customType } from "drizzle-orm/pg-core";

/** PostGIS WGS84 geometry helpers for Zone polygons (S4+). */
export const multiPolygon4326 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(MultiPolygon, 4326)";
  },
});

export const point4326 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)";
  },
});
