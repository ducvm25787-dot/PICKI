import { describe, expect, it } from "vitest";
import { haversineMeters, validateLatLng } from "./geo.js";

describe("geo helpers", () => {
  it("validates lat/lng bounds", () => {
    expect(() => {
      validateLatLng({ lat: 91, lng: 0 });
    }).toThrow();
    expect(() => {
      validateLatLng({ lat: 0, lng: 181 });
    }).toThrow();
  });

  it("computes haversine distance", () => {
    const a = { lat: 20.9883, lng: 105.8414 };
    const b = { lat: 20.9883, lng: 105.8514 };
    const meters = haversineMeters(a, b);
    expect(meters).toBeGreaterThan(900);
    expect(meters).toBeLessThan(1100);
  });
});
