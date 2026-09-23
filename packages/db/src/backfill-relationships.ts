import postgres from "postgres";
import { backfillAllRelationships } from "./relationships/queries.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });
try {
  const n = await backfillAllRelationships(sql);
  console.log(`Backfilled relationships for ${String(n)} user×location pairs`);
} finally {
  await sql.end();
}
