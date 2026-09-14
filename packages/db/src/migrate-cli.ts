import { migrate } from "./migrator.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const result = await migrate({ databaseUrl });
if (result.applied.length > 0) {
  console.log("Applied:", result.applied.join(", "));
}
if (result.skipped.length > 0) {
  console.log("Skipped (already applied):", result.skipped.join(", "));
}
if (result.applied.length === 0 && result.skipped.length === 0) {
  console.log("No migration files found.");
}
