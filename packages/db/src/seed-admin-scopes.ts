import { createPickiDb } from "./client.js";

/** Must match normalizePhone in the API. */
const SUPER_ADMIN_PHONE = "+84908888030";
const CITY_ADMIN_PHONE = "+84908888031";

async function userIdForPhone(sql: ReturnType<typeof createPickiDb>["sql"], phone: string) {
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_identities
    WHERE provider = 'PHONE' AND external_user_id = ${phone}
    LIMIT 1
  `;
  return existing[0]?.user_id;
}

async function ensureUser(sql: ReturnType<typeof createPickiDb>["sql"], phone: string, displayName: string) {
  const existingId = await userIdForPhone(sql, phone);
  if (existingId) {
    await sql`UPDATE users SET display_name = ${displayName} WHERE id = ${existingId}::uuid AND display_name IS NULL`;
    return existingId;
  }
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

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const { sql } = createPickiDb(databaseUrl);
  try {
    const [city] = await sql<{ id: string; label: string }[]>`
      SELECT id, label FROM experience_cities WHERE slug = 'hanoi' OR code = 'Hanoi' LIMIT 1
    `;
    if (!city) throw new Error("Không thấy thành phố Hà Nội — chạy seed thành phố trước");

    const superUserId = await ensureUser(sql, SUPER_ADMIN_PHONE, "Super Admin");
    const cityUserId = await ensureUser(sql, CITY_ADMIN_PHONE, "City Admin Hà Nội");

    const superRole = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${superUserId}::uuid AND role = 'SUPER_ADMIN' AND scope_type IS NULL AND scope_id IS NULL
      LIMIT 1
    `;
    if (!superRole[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role, scope_type, scope_id)
        VALUES (${superUserId}::uuid, 'SUPER_ADMIN', NULL, NULL)
      `;
    }

    const cityRole = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${cityUserId}::uuid AND role = 'CITY_ADMIN' AND scope_type = 'CITY' AND scope_id = ${city.id}::uuid
      LIMIT 1
    `;
    if (!cityRole[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role, scope_type, scope_id)
        VALUES (${cityUserId}::uuid, 'CITY_ADMIN', 'CITY', ${city.id}::uuid)
      `;
    }

    console.log("Seeded admin scope accounts:");
    console.log("  Super Admin:", SUPER_ADMIN_PHONE, "(UI: 0908888030) → toàn hệ thống");
    console.log("  City Admin: ", CITY_ADMIN_PHONE, `(UI: 0908888031) → ${city.label}`);
    console.log("  Cửa đăng nhập: http://localhost:3001/admin/login");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
