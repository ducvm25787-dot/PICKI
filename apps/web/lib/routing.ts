/** In-app route via OSRM (OSM) — vendor-swappable; no GPS trail stored.
 * Pickee Zone = short trips → ưu tiên đi bộ / xe máy / xe đạp (không mặc định ô tô).
 */

export type RouteLatLng = { lat: number; lng: number };

/** UX modes — map to OSRM profiles (moto dùng driving; profile moto riêng = self-host sau). */
export type TravelMode = "walk" | "scooter" | "bike";

export const TRAVEL_MODES: {
  id: TravelMode;
  label: string;
  osrmProfile: "walking" | "driving" | "cycling";
  googleTravelMode: "walking" | "driving" | "bicycling";
}[] = [
  { id: "walk", label: "Đi bộ", osrmProfile: "walking", googleTravelMode: "walking" },
  { id: "scooter", label: "Xe máy", osrmProfile: "driving", googleTravelMode: "driving" },
  { id: "bike", label: "Xe đạp", osrmProfile: "cycling", googleTravelMode: "bicycling" },
];

export function parseTravelMode(raw: string | null | undefined): TravelMode {
  if (raw === "scooter" || raw === "bike" || raw === "walk") return raw;
  if (raw === "cycling" || raw === "bicycle") return "bike";
  if (raw === "driving" || raw === "moto" || raw === "motorcycle") return "scooter";
  if (raw === "walking" || raw === "foot") return "walk";
  return "walk";
}

export function travelModeMeta(mode: TravelMode) {
  return TRAVEL_MODES.find((m) => m.id === mode) ?? TRAVEL_MODES[0]!;
}

/**
 * Default mode for Zone local trips: ngắn → đi bộ, xa hơn → xe máy.
 * (Rough straight-line; không thay serviceability.)
 */
export function suggestTravelMode(origin: RouteLatLng, dest: RouteLatLng): TravelMode {
  const m = haversineM(origin, dest);
  if (m <= 900) return "walk";
  return "scooter";
}

function haversineM(a: RouteLatLng, b: RouteLatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type RouteStep = {
  instruction: string;
  distanceM: number;
  durationS: number;
  name: string;
};

export type PickeeRoute = {
  mode: TravelMode;
  distanceM: number;
  durationS: number;
  /** Leaflet-friendly lat/lng path */
  path: RouteLatLng[];
  steps: RouteStep[];
};

/** @deprecated use PickeeRoute */
export type DrivingRoute = PickeeRoute;

type OsrmStep = {
  name?: string;
  distance?: number;
  duration?: number;
  maneuver?: { type?: string; modifier?: string; instruction?: string };
};

type OsrmResponse = {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
    legs?: { steps?: OsrmStep[] }[];
  }[];
};

function stepInstruction(step: OsrmStep): string {
  if (step.maneuver?.instruction) return step.maneuver.instruction;
  const type = step.maneuver?.type ?? "continue";
  const mod = step.maneuver?.modifier;
  const road = step.name?.trim();
  const turn =
    type === "depart"
      ? "Xuất phát"
      : type === "arrive"
        ? "Đến nơi"
        : type === "turn"
          ? mod === "left"
            ? "Rẽ trái"
            : mod === "right"
              ? "Rẽ phải"
              : "Rẽ"
          : type === "new name"
            ? "Đi tiếp"
            : type === "merge"
              ? "Nhập làn"
              : type === "roundabout" || type === "rotary"
                ? "Vào vòng xuyến"
                : type === "fork"
                  ? "Chọn nhánh"
                  : "Đi tiếp";
  return road ? `${turn} · ${road}` : turn;
}

/** Fetch route for mode. Returns null if OSRM unavailable. */
export async function fetchRoute(
  origin: RouteLatLng,
  dest: RouteLatLng,
  mode: TravelMode = "walk",
): Promise<PickeeRoute | null> {
  const meta = travelModeMeta(mode);
  const url =
    `https://router.project-osrm.org/route/v1/${meta.osrmProfile}/` +
    `${String(origin.lng)},${String(origin.lat)};${String(dest.lng)},${String(dest.lat)}` +
    `?overview=full&geometries=geojson&steps=true&annotations=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as OsrmResponse;
    if (data.code !== "Ok" || !data.routes?.[0]) return null;
    const route = data.routes[0];
    const coords = route.geometry?.coordinates ?? [];
    const path: RouteLatLng[] = coords.map(([lng, lat]) => ({ lat, lng }));
    const steps: RouteStep[] = [];
    for (const leg of route.legs ?? []) {
      for (const s of leg.steps ?? []) {
        steps.push({
          instruction: stepInstruction(s),
          distanceM: Math.round(s.distance ?? 0),
          durationS: Math.round(s.duration ?? 0),
          name: s.name ?? "",
        });
      }
    }
    return {
      mode,
      distanceM: Math.round(route.distance),
      durationS: Math.round(route.duration),
      path,
      steps,
    };
  } catch {
    return null;
  }
}

/** @deprecated use fetchRoute */
export async function fetchDrivingRoute(
  origin: RouteLatLng,
  dest: RouteLatLng,
): Promise<PickeeRoute | null> {
  return fetchRoute(origin, dest, "scooter");
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${String(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.max(1, Math.round(s / 60));
  if (min < 60) return `~${String(min)} phút`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r > 0 ? `~${String(h)} giờ ${String(r)} phút` : `~${String(h)} giờ`;
}

/** In-app navigate deep link (Pickee). */
export function pickeeNavigateHref(opts: {
  destLat: number;
  destLng: number;
  label?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  /** walk | scooter | bike — omit = gợi ý theo khoảng cách khi mở trang */
  mode?: TravelMode | null;
}): string {
  const q = new URLSearchParams({
    destLat: String(opts.destLat),
    destLng: String(opts.destLng),
  });
  if (opts.label) q.set("label", opts.label);
  if (opts.originLat != null && opts.originLng != null) {
    q.set("originLat", String(opts.originLat));
    q.set("originLng", String(opts.originLng));
  }
  if (opts.mode) q.set("mode", opts.mode);
  return `/navigate?${q.toString()}`;
}
