export type LatLng = {
  lat: number;
  lng: number;
};

export const WGS84_SRID = 4326;

export function validateLatLng(point: LatLng): void {
  if (point.lat < -90 || point.lat > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (point.lng < -180 || point.lng > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
}

/** Haversine distance in meters (fallback when routing adapter unavailable). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  validateLatLng(a);
  validateLatLng(b);
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}
