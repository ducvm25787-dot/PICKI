import { describe, expect, it } from "vitest";
import { checkPostgis, createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("Picki database (integration)", () => {
  it("applies migrations idempotently", async () => {
    const first = await migrate({ databaseUrl });
    expect(first.applied.length).toBeGreaterThan(0);

    const second = await migrate({ databaseUrl });
    expect(second.applied).toHaveLength(0);
    expect(second.skipped.length).toBeGreaterThan(0);
  });

  it("has PostGIS enabled", async () => {
    const { sql } = createPickiDb(databaseUrl);
    try {
      const version = await checkPostgis(sql);
      expect(version.length).toBeGreaterThan(0);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  it("has infrastructure tables", async () => {
    const { sql } = createPickiDb(databaseUrl);
    try {
      const tables = await sql<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'audit_logs',
            'outbox_events',
            'picki_schema_migrations',
            'users',
            'user_identities',
            'user_roles',
            'auth_sessions',
            'auth_otp_challenges'
          )
      `;
      const names = tables.map((t) => t.tablename).sort();
      expect(names).toEqual([
        "audit_logs",
        "auth_otp_challenges",
        "auth_sessions",
        "outbox_events",
        "picki_schema_migrations",
        "user_identities",
        "user_roles",
        "users",
      ]);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
