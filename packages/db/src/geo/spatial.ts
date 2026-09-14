import type postgres from "postgres";
import { validateLatLng, type LatLng } from "./types.js";

/** Great-circle distance via PostGIS ST_DistanceSphere (meters). */
export async function distanceMeters(
  sql: postgres.Sql,
  from: LatLng,
  to: LatLng,
): Promise<number> {
  validateLatLng(from);
  validateLatLng(to);

  const rows = await sql<{ distance: string }[]>`
    SELECT ST_DistanceSphere(
      ST_SetSRID(ST_MakePoint(${from.lng}, ${from.lat}), 4326),
      ST_SetSRID(ST_MakePoint(${to.lng}, ${to.lat}), 4326)
    )::float8 AS distance
  `;

  const value = rows[0]?.distance;
  if (value === undefined) {
    throw new Error("Failed to compute distance");
  }
  return Number(value);
}

/** Point-in-polygon (or multipolygon) using WKT geometry in EPSG:4326. */
export async function containsPoint(
  sql: postgres.Sql,
  geometryWkt: string,
  point: LatLng,
): Promise<boolean> {
  validateLatLng(point);

  const rows = await sql<{ contained: boolean }[]>`
    SELECT ST_Contains(
      ST_SetSRID(ST_GeomFromText(${geometryWkt}), 4326),
      ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)
    ) AS contained
  `;

  return rows[0]?.contained ?? false;
}

/** ST_Within alias — point inside geometry boundary. */
export async function pointWithinGeometry(
  sql: postgres.Sql,
  geometryWkt: string,
  point: LatLng,
): Promise<boolean> {
  validateLatLng(point);

  const rows = await sql<{ within: boolean }[]>`
    SELECT ST_Within(
      ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326),
      ST_SetSRID(ST_GeomFromText(${geometryWkt}), 4326)
    ) AS within
  `;

  return rows[0]?.within ?? false;
}

/** Validate WKT parses as geometry (throws on invalid). */
export async function assertValidGeometryWkt(
  sql: postgres.Sql,
  geometryWkt: string,
): Promise<void> {
  const rows = await sql<{ valid: boolean }[]>`
    SELECT ST_IsValid(ST_SetSRID(ST_GeomFromText(${geometryWkt}), 4326)) AS valid
  `;
  if (!rows[0]?.valid) {
    throw new Error("Invalid geometry WKT");
  }
}
