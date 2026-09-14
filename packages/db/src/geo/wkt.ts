import type { LatLng } from "./types.js";

/** WGS84 point WKT: POINT(lng lat) */
export function pointWkt({ lng, lat }: LatLng): string {
  return `POINT(${String(lng)} ${String(lat)})`;
}
