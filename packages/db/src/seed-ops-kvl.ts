import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";
/** Must match normalizePhone("0908888001") in API */
const PROVIDER_PHONE = "+84908888001";
const RUNNER_PHONE = "+84908888002";
const ADMIN_PHONE = "+84908888003";
const LEGACY_PROVIDER_PHONES = ["+849088880001"];
const LEGACY_RUNNER_PHONES = ["+849088880002"];

async function userIdForPhone(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
): Promise<string | undefined> {
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_identities
    WHERE provider = 'PHONE' AND external_user_id = ${phone}
    LIMIT 1
  `;
  return existing[0]?.user_id;
}

async function ensureUser(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
  displayName: string,
) {
  const existingId = await userIdForPhone(sql, phone);
  if (existingId) return existingId;

  const [user] = await sql<{ id: string }[]>`
    INSERT INTO users (display_name) VALUES (${displayName}) RETURNING id
  `;
  if (!user) throw new Error("Failed to create user");

  await sql`
    INSERT INTO user_identities (user_id, provider, external_user_id, verified_at)
    VALUES (${user.id}::uuid, 'PHONE', ${phone}, now())
  `;
  return user.id;
}

/** Ops were seeded with an extra 0; re-link memberships to the canonical login identity. */
async function migrateLegacyOpsUser(
  sql: ReturnType<typeof createPickiDb>["sql"],
  legacyPhones: string[],
  canonicalUserId: string,
  opsTable: "provider_members" | "runners",
) {
  for (const legacyPhone of legacyPhones) {
    const legacyUserId = await userIdForPhone(sql, legacyPhone);
    if (!legacyUserId || legacyUserId === canonicalUserId) continue;

    if (opsTable === "provider_members") {
      await sql`
        UPDATE provider_members SET user_id = ${canonicalUserId}::uuid
        WHERE user_id = ${legacyUserId}::uuid
      `;
    } else {
      await sql`
        UPDATE runners SET user_id = ${canonicalUserId}::uuid
        WHERE user_id = ${legacyUserId}::uuid
      `;
    }

    await sql`
      UPDATE user_roles SET user_id = ${canonicalUserId}::uuid
      WHERE user_id = ${legacyUserId}::uuid
        AND role IN ('PROVIDER_OWNER', 'RUNNER')
        AND NOT EXISTS (
          SELECT 1 FROM user_roles ur2
          WHERE ur2.user_id = ${canonicalUserId}::uuid AND ur2.role = user_roles.role
        )
    `;
    await sql`
      DELETE FROM user_roles
      WHERE user_id = ${legacyUserId}::uuid
        AND role IN ('PROVIDER_OWNER', 'RUNNER')
    `;
  }
}

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await migrate({ databaseUrl });
  const { sql } = createPickiDb(databaseUrl);

  try {
    const zone = await sql<{ id: string }[]>`
      SELECT id FROM zones WHERE slug = ${KVL_SLUG} LIMIT 1
    `;
    if (!zone[0]) {
      console.error("KVL zone missing — run seed:kvl first");
      process.exit(1);
    }

    const location = await sql<{ id: string; provider_id: string }[]>`
      SELECT pl.id, pl.provider_id
      FROM provider_locations pl
      INNER JOIN providers p ON p.id = pl.provider_id
      WHERE p.slug = 'com-tam-kim-van'
      LIMIT 1
    `;
    if (!location[0]) {
      console.error("Demo provider missing — run seed:providers first");
      process.exit(1);
    }

    const providerUserId = await ensureUser(sql, PROVIDER_PHONE, "Chủ quán Cơm Tấm");
    const runnerUserId = await ensureUser(sql, RUNNER_PHONE, "Runner KVL Pilot");
    const adminUserId = await ensureUser(sql, ADMIN_PHONE, "Ops KVL Admin");

    await migrateLegacyOpsUser(sql, LEGACY_PROVIDER_PHONES, providerUserId, "provider_members");
    await migrateLegacyOpsUser(sql, LEGACY_RUNNER_PHONES, runnerUserId, "runners");

    for (const legacyPhone of [...LEGACY_PROVIDER_PHONES, ...LEGACY_RUNNER_PHONES]) {
      const legacyUserId = await userIdForPhone(sql, legacyPhone);
      if (!legacyUserId || legacyUserId === providerUserId || legacyUserId === runnerUserId) continue;
      await sql`DELETE FROM user_identities WHERE user_id = ${legacyUserId}::uuid`;
      await sql`DELETE FROM users WHERE id = ${legacyUserId}::uuid`;
    }

    const memberExists = await sql<{ id: string }[]>`
      SELECT id FROM provider_members
      WHERE user_id = ${providerUserId}::uuid AND provider_id = ${location[0].provider_id}::uuid
      LIMIT 1
    `;
    if (!memberExists[0]) {
      await sql`
        INSERT INTO provider_members (user_id, provider_id, provider_location_id, role)
        VALUES (${providerUserId}::uuid, ${location[0].provider_id}::uuid, ${location[0].id}::uuid, 'OWNER')
      `;
    }

    const roleExists = await sql<{ id: string }[]>`
      SELECT id FROM user_roles WHERE user_id = ${providerUserId}::uuid AND role = 'PROVIDER_OWNER' LIMIT 1
    `;
    if (!roleExists[0]) {
      await sql`INSERT INTO user_roles (user_id, role) VALUES (${providerUserId}::uuid, 'PROVIDER_OWNER')`;
    }

    const runnerExisting = await sql<{ id: string }[]>`
      SELECT id FROM runners WHERE user_id = ${runnerUserId}::uuid LIMIT 1
    `;
    if (!runnerExisting[0]) {
      const [runner] = await sql<{ id: string }[]>`
        INSERT INTO runners (user_id, zone_id, status)
        VALUES (${runnerUserId}::uuid, ${zone[0].id}::uuid, 'ACTIVE')
        RETURNING id
      `;
      if (runner) {
        await sql`
          INSERT INTO runner_presence (runner_id, status) VALUES (${runner.id}::uuid, 'AVAILABLE')
        `;
      }
    }

    const runnerRole = await sql<{ id: string }[]>`
      SELECT id FROM user_roles WHERE user_id = ${runnerUserId}::uuid AND role = 'RUNNER' LIMIT 1
    `;
    if (!runnerRole[0]) {
      await sql`INSERT INTO user_roles (user_id, role) VALUES (${runnerUserId}::uuid, 'RUNNER')`;
    }

    const adminRole = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${adminUserId}::uuid AND role = 'ZONE_ADMIN' LIMIT 1
    `;
    if (!adminRole[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role, scope_type, scope_id)
        VALUES (${adminUserId}::uuid, 'ZONE_ADMIN', 'ZONE', ${zone[0].id}::uuid)
      `;
    }

    console.log("Seeded ops accounts:");
    console.log("  Provider:", PROVIDER_PHONE, "(UI: 0908888001) → Cơm Tấm Kim Văn");
    console.log("  Runner:  ", RUNNER_PHONE, "(UI: 0908888002) → Zone KVL");
    console.log("  Admin:   ", ADMIN_PHONE, "(UI: 0908888003) → Zone KVL Ops");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
