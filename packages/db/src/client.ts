import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type PickiDb = ReturnType<typeof createPickiDb>["db"];
export type PickiSql = ReturnType<typeof createPickiDb>["sql"];

export function createPickiDb(databaseUrl: string) {
  const sql = postgres(databaseUrl, { max: 10 });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

export async function checkPostgis(sql: postgres.Sql): Promise<string> {
  const rows = await sql<{ version: string }[]>`
    SELECT PostGIS_Version() AS version
  `;
  const version = rows[0]?.version;
  if (!version) {
    throw new Error("PostGIS is not available");
  }
  return version;
}
