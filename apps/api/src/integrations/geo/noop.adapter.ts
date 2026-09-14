import type { GeoAdapter } from "@picki/shared";

export const noopGeoAdapter: GeoAdapter = {
  providerKey: "noop",

  async geocode() {
    return null;
  },

  async reverseGeocode() {
    return null;
  },

  async routeEtaSeconds() {
    return null;
  },
};
