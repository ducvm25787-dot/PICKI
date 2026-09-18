/** External map deep-links via Geo adapter pattern (Google Maps URL — vendor-swappable later). */

export { pickeeNavigateHref } from "./routing";
export type { TravelMode } from "./routing";

export function mapsSearchUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${String(lat)},${String(lng)}`;
}

export function mapsSearchAddressUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Fallback: mở Google Maps (travelmode khớp Đi bộ / Xe máy / Xe đạp). */
export function mapsDirectionsUrl(opts: {
  destLat: number;
  destLng: number;
  originLat?: number | null;
  originLng?: number | null;
  /** Google: walking | driving | bicycling */
  travelMode?: "walking" | "driving" | "bicycling";
}): string {
  const dest = `${String(opts.destLat)},${String(opts.destLng)}`;
  const mode = opts.travelMode ?? "walking";
  if (opts.originLat != null && opts.originLng != null) {
    return `https://www.google.com/maps/dir/?api=1&origin=${String(opts.originLat)},${String(opts.originLng)}&destination=${dest}&travelmode=${mode}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
}
