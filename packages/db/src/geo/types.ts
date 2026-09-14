export type LatLng = {
  lat: number;
  lng: number;
};

export function validateLatLng(point: LatLng): void {
  if (point.lat < -90 || point.lat > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (point.lng < -180 || point.lng > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
}
