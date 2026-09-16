import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const KITCHEN = {
  slug: "bep-nha-lan",
  brandName: "BẾP NHÀ LAN",
  locationSlug: "bep-nha-lan-ct12",
  displayName: "Bếp Nhà Lan — CT12",
  tagline: "Mâm cơm gia đình — đặt trước, giao theo khung giờ",
  address: "Căn hộ CT12 Kim Văn (bếp home cook)",
  lat: 20.9885,
  lng: 105.8425,
  ownerPhone: "+84908888014",
  ownerName: "Bếp Nhà Lan",
  cutoff: "16:00",
} as const;

function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function ensureUser(
  sql: ReturnType<typeof createPickiDb>["sql"],
  phone: string,
  displayName: string,
) {
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM user_identities
    WHERE provider = 'PHONE' AND external_user_id = ${phone}
    LIMIT 1
  `;
  if (existing[0]) return existing[0].user_id;

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
    const zoneId = zone[0].id;
    const serviceDate = vnToday();

    let providerId = "";
    let locationId = "";

    const existing = await sql<{ id: string; location_id: string }[]>`
      SELECT p.id, pl.id AS location_id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = ${KITCHEN.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Kitchen already seeded:", KITCHEN.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${KITCHEN.slug}, ${KITCHEN.brandName}, ${"HOME_COOK"}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create kitchen");
        providerId = provider.id;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status, address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${KITCHEN.locationSlug},
            ${KITCHEN.displayName},
            ${"ACTIVE"},
            ${KITCHEN.address},
            ${KITCHEN.lat},
            ${KITCHEN.lng}
          )
          RETURNING id
        `;
        if (!location) throw new Error("Failed to create location");
        locationId = location.id;

        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${location.id}::uuid, ${zoneId}::uuid, ${"ACTIVE"})
        `;
        await tx`
          INSERT INTO provider_live_status (provider_location_id, status, message)
          VALUES (${location.id}::uuid, ${"OPEN"}, ${"Nhận preorder bữa tối tới 16:00"})
        `;
      });
    }

    await sql`
      INSERT INTO provider_profiles (provider_id, tagline)
      VALUES (${providerId}::uuid, ${KITCHEN.tagline})
      ON CONFLICT (provider_id) DO UPDATE SET tagline = ${KITCHEN.tagline}
    `;

    await sql`
      INSERT INTO family_dinner_provider_settings (
        provider_location_id, enabled, cutoff_time, daily_capacity
      ) VALUES (
        ${locationId}::uuid, true, ${KITCHEN.cutoff}::time, 40
      )
      ON CONFLICT (provider_location_id) DO UPDATE
        SET enabled = true, cutoff_time = ${KITCHEN.cutoff}::time, updated_at = now()
    `;

    let menuId = "";
    const menu = await sql<{ id: string }[]>`
      SELECT id FROM family_dinner_daily_menus
      WHERE provider_location_id = ${locationId}::uuid AND service_date = ${serviceDate}::date
      LIMIT 1
    `;
    if (menu[0]) {
      menuId = menu[0].id;
      await sql`DELETE FROM family_dinner_menu_items WHERE daily_menu_id = ${menuId}::uuid`;
      await sql`
        DELETE FROM family_dinner_delivery_windows
        WHERE provider_location_id = ${locationId}::uuid AND service_date = ${serviceDate}::date
      `;
      await sql`
        UPDATE family_dinner_daily_menus
        SET status = 'PUBLISHED', published_at = now(), updated_at = now()
        WHERE id = ${menuId}::uuid
      `;
    } else {
      const [created] = await sql<{ id: string }[]>`
        INSERT INTO family_dinner_daily_menus (
          provider_location_id, service_date, status, published_at
        ) VALUES (
          ${locationId}::uuid, ${serviceDate}::date, 'PUBLISHED', now()
        )
        RETURNING id
      `;
      if (!created) throw new Error("Failed menu");
      menuId = created.id;
    }

    const items = [
      { category: "MAIN", name: "Thịt rang cháy cạnh", price: 109_000, sort: 1 },
      { category: "MAIN", name: "Cá kho tộ", price: 119_000, sort: 2 },
      { category: "MAIN", name: "Gà rang gừng", price: 119_000, sort: 3 },
      { category: "SIDE", name: "Đậu tẩm hành", price: 39_000, sort: 1 },
      { category: "SIDE", name: "Nem rán", price: 49_000, sort: 2 },
      { category: "VEGETABLE", name: "Rau muống luộc", price: 29_000, sort: 1 },
      { category: "VEGETABLE", name: "Cải xào tỏi", price: 35_000, sort: 2 },
      { category: "SOUP", name: "Canh cua mồng tơi", price: 69_000, sort: 1 },
      { category: "SOUP", name: "Canh bí đỏ", price: 49_000, sort: 2 },
      { category: "EXTRA", name: "Cà muối", price: 19_000, sort: 1 },
      { category: "EXTRA", name: "Dưa muối", price: 19_000, sort: 2 },
    ] as const;

    for (const item of items) {
      await sql`
        INSERT INTO family_dinner_menu_items (
          daily_menu_id, category, name, price_vnd, capacity, remaining_capacity, sort_order, status
        ) VALUES (
          ${menuId}::uuid,
          ${item.category},
          ${item.name},
          ${item.price},
          ${30},
          ${30},
          ${item.sort},
          ${"ACTIVE"}
        )
      `;
      console.log("  +", item.category, item.name);
    }

    // Phase C: sample recipes + link to today's menu items
    const recipeDefs = [
      {
        name: "Thịt rang cháy cạnh",
        category: "MAIN",
        ingredients: [
          { name: "Ba chỉ", qty: 450, unit: "g", yield: 100 },
          { name: "Hành khô", qty: 20, unit: "g", yield: 100 },
          { name: "Nước mắm", qty: 20, unit: "ml", yield: 100 },
          { name: "Đường", qty: 12, unit: "g", yield: 100 },
        ],
      },
      {
        name: "Canh cua mồng tơi",
        category: "SOUP",
        ingredients: [
          { name: "Cua", qty: 200, unit: "g", yield: 95 },
          { name: "Mồng tơi", qty: 300, unit: "g", yield: 85 },
          { name: "Mướp", qty: 200, unit: "g", yield: 90 },
        ],
      },
      {
        name: "Rau muống luộc",
        category: "VEGETABLE",
        ingredients: [{ name: "Rau muống", qty: 400, unit: "g", yield: 85 }],
      },
      {
        name: "Đậu tẩm hành",
        category: "SIDE",
        ingredients: [
          { name: "Đậu phụ", qty: 300, unit: "g", yield: 100 },
          { name: "Hành lá", qty: 30, unit: "g", yield: 100 },
        ],
      },
    ] as const;

    for (const def of recipeDefs) {
      let recipeId = "";
      const existingRecipe = await sql<{ id: string }[]>`
        SELECT id FROM provider_recipes
        WHERE provider_id = ${providerId}::uuid AND name = ${def.name}
        LIMIT 1
      `;
      if (existingRecipe[0]) {
        recipeId = existingRecipe[0].id;
      } else {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO provider_recipes (provider_id, name, category, status)
          VALUES (${providerId}::uuid, ${def.name}, ${def.category}, 'ACTIVE')
          RETURNING id
        `;
        if (!created) continue;
        recipeId = created.id;
      }

      const ver = await sql<{ id: string; version_number: number }[]>`
        SELECT id, version_number FROM provider_recipe_versions
        WHERE recipe_id = ${recipeId}::uuid
        ORDER BY version_number DESC
        LIMIT 1
      `;
      let versionId = ver[0]?.id ?? "";
      if (!versionId) {
        const [v] = await sql<{ id: string }[]>`
          INSERT INTO provider_recipe_versions (recipe_id, version_number, portion_label)
          VALUES (${recipeId}::uuid, 1, '1 family portion')
          RETURNING id
        `;
        if (!v) continue;
        versionId = v.id;
        for (const [idx, ing] of def.ingredients.entries()) {
          let ingredientId = "";
          const found = await sql<{ id: string }[]>`
            SELECT id FROM ingredient_master WHERE lower(name) = lower(${ing.name}) LIMIT 1
          `;
          if (found[0]) {
            ingredientId = found[0].id;
          } else {
            const [ins] = await sql<{ id: string }[]>`
              INSERT INTO ingredient_master (name, base_unit, default_yield_percent, procurement_class)
              VALUES (${ing.name}, ${ing.unit}, ${ing.yield}, 'SAME_DAY')
              RETURNING id
            `;
            if (!ins) continue;
            ingredientId = ins.id;
          }
          await sql`
            INSERT INTO recipe_ingredients (
              recipe_version_id, ingredient_id, quantity_net, unit, yield_percent_override, sort_order
            ) VALUES (
              ${versionId}::uuid,
              ${ingredientId}::uuid,
              ${ing.qty},
              ${ing.unit},
              ${ing.yield},
              ${idx}
            )
          `;
        }
      }

      await sql`
        UPDATE family_dinner_menu_items
        SET recipe_version_id = ${versionId}::uuid
        WHERE daily_menu_id = ${menuId}::uuid AND name = ${def.name}
      `;
      console.log("  recipe →", def.name);
    }

    await sql`
      UPDATE family_dinner_provider_settings
      SET procurement_buffer_percent = 60, daily_capacity = 20, updated_at = now()
      WHERE provider_location_id = ${locationId}::uuid
    `;

    const windows = [
      { start: "17:30", end: "18:00", cap: 12 },
      { start: "18:00", end: "18:30", cap: 15 },
      { start: "18:30", end: "19:00", cap: 15 },
      { start: "19:00", end: "19:30", cap: 10 },
    ];
    for (const w of windows) {
      await sql`
        INSERT INTO family_dinner_delivery_windows (
          provider_location_id, service_date, starts_at, ends_at, capacity, remaining_capacity, status
        ) VALUES (
          ${locationId}::uuid,
          ${serviceDate}::date,
          ${w.start}::time,
          ${w.end}::time,
          ${w.cap},
          ${w.cap},
          ${"OPEN"}
        )
      `;
    }

    const ownerId = await ensureUser(sql, KITCHEN.ownerPhone, KITCHEN.ownerName);
    const memberExists = await sql<{ id: string }[]>`
      SELECT id FROM provider_members
      WHERE user_id = ${ownerId}::uuid AND provider_id = ${providerId}::uuid
      LIMIT 1
    `;
    if (!memberExists[0]) {
      await sql`
        INSERT INTO provider_members (user_id, provider_id, provider_location_id, role)
        VALUES (${ownerId}::uuid, ${providerId}::uuid, ${locationId}::uuid, 'OWNER')
      `;
    }
    const roleExists = await sql<{ id: string }[]>`
      SELECT id FROM user_roles
      WHERE user_id = ${ownerId}::uuid AND role = 'PROVIDER_OWNER'
      LIMIT 1
    `;
    if (!roleExists[0]) {
      await sql`
        INSERT INTO user_roles (user_id, role)
        VALUES (${ownerId}::uuid, 'PROVIDER_OWNER')
      `;
    }

    console.log(
      `Family Dinner login: ${KITCHEN.ownerPhone} (UI: 0908888014) · service_date=${serviceDate}`,
    );
    console.log("✓ Family Dinner seed done (Bếp Nhà Lan)");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

void seed();
