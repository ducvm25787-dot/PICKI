/**
 * Browser geolocation helpers.
 * Default = one-shot. `watchPosition` only while user is in active in-app nav —
 * never persisted / no GPS trail table (Master Spec §22, ADR-053).
 */

export type GeoPosition = { lat: number; lng: number };

const KVL_FALLBACK: GeoPosition = { lat: 20.974, lng: 105.821 };

export function zoneFallbackCenter(fallback?: GeoPosition | null): GeoPosition {
  return fallback ? { ...fallback } : { ...KVL_FALLBACK };
}

export async function getCurrentPositionOnce(options?: {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  /** Prefer Zone anchor when GPS unavailable */
  fallback?: GeoPosition | null;
}): Promise<{ position: GeoPosition; source: "gps" | "fallback"; error?: string }> {
  const fallback = zoneFallbackCenter(options?.fallback);

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { position: fallback, source: "fallback", error: "Thiết bị không hỗ trợ GPS" };
  }

  const timeoutMs = options?.timeoutMs ?? 12_000;
  try {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: timeoutMs,
        maximumAge: 60_000,
      });
    });
    return {
      position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
      source: "gps",
    };
  } catch (e) {
    const msg =
      e instanceof GeolocationPositionError
        ? e.code === e.PERMISSION_DENIED
          ? "Bạn đã tắt quyền vị trí"
          : e.code === e.TIMEOUT
            ? "GPS hết thời gian chờ"
            : "Không lấy được vị trí"
        : "Không lấy được vị trí";
    return { position: fallback, source: "fallback", error: msg };
  }
}

/** Active navigation only — call returned stop() on unmount / Dừng. Does not store trail. */
export function watchPositionLive(
  onUpdate: (pos: GeoPosition) => void,
  options?: { enableHighAccuracy?: boolean },
): { stop: () => void } {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { stop: () => undefined };
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    },
    () => undefined,
    {
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      maximumAge: 3_000,
      timeout: 15_000,
    },
  );
  return {
    stop: () => {
      navigator.geolocation.clearWatch(id);
    },
  };
}
