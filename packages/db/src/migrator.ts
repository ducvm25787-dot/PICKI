import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const MIGRATIONS_TABLE = "picki_schema_migrations";

export type MigrateOptions = {
  databaseUrl: string;
  migrationsDir?: string;
};

export type MigrateResult = {
  applied: string[];
  skipped: string[];
};

function migrationsPath(custom?: string): string {
  if (custom) return custom;
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");
}

async function ensureMigrationsTable(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith(".sql")).sort();
}

export async function migrate(options: MigrateOptions): Promise<MigrateResult> {
  const dir = migrationsPath(options.migrationsDir);
  const sql = postgres(options.databaseUrl, { max: 1 });
  const applied: string[] = [];
  const skipped: string[] = [];

  try {
    await ensureMigrationsTable(sql);
    const files = await listMigrationFiles(dir);
    const rows = await sql.unsafe<{ filename: string }[]>(
      `SELECT filename FROM ${MIGRATIONS_TABLE}`,
    );
    const done = new Set(rows.map((r) => r.filename));

    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }

      const body = await readFile(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx.unsafe(`INSERT INTO ${MIGRATIONS_TABLE} (filename) VALUES ($1)`, [
          file,
        ]);
      });
      applied.push(file);
    }

    return { applied, skipped };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
