import type { GeoAdapter, GeoPoint } from "@picki/shared";
import { haversineMeters } from "@picki/shared";

/** Dev/pilot fallback — straight-line ETA (~30 km/h), no geocoding vendor. */
export const localGeoAdapter: GeoAdapter = {
  providerKey: "local",

  async geocode() {
    return null;
  },

  async reverseGeocode() {
    return null;
  },

  async routeEtaSeconds(from: GeoPoint, to: GeoPoint) {
    const meters = haversineMeters(from, to);
    const urbanSpeedMps = 8.33;
    return Math.max(60, Math.round(meters / urbanSpeedMps));
  },

  async navigationLink(from: GeoPoint, to: GeoPoint) {
    return `https://www.google.com/maps/dir/?api=1&origin=${String(from.lat)},${String(from.lng)}&destination=${String(to.lat)},${String(to.lng)}`;
  },
};
