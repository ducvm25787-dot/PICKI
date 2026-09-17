import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";

const KVL_SLUG = "kim-van-kim-lu";

const PHO = {
  slug: "pho-ga-kim-van",
  brandName: "PHỞ GÀ KIM VĂN",
  locationSlug: "pho-ga-kim-van-ct12",
  displayName: "Phở Gà Kim Văn — CT12",
  tagline: "Sáng mai ăn gì? — đặt tối, giao sáng",
  address: "Gần CT12 Kim Văn, Hoàng Mai",
  lat: 20.9886,
  lng: 105.8421,
  ownerPhone: "+84908888015",
  ownerName: "Phở Gà Kim Văn",
  cutoff: "23:30",
  openFrom: "20:00",
  type: "RESTAURANT",
} as const;

const OFFERINGS = [
  { slug: "pho-ga", name: "Phở gà", description: "Nước dùng ninh xương gà", amountVnd: 45_000 },
  { slug: "banh-mi", name: "Bánh mì thịt", description: "Pate + thịt nguội", amountVnd: 25_000 },
  { slug: "xoi-ga", name: "Xôi gà", description: "Xôi mềm + gà xé", amountVnd: 35_000 },
  { slug: "bun-bo", name: "Bún bò Huế", description: "Tô nhỏ sáng", amountVnd: 50_000 },
  { slug: "cafe-sua", name: "Cà phê sữa đá", description: "Ly mang đi", amountVnd: 20_000 },
] as const;

function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Mirror defaultBreakfastServiceDate: before noon → today, else tomorrow. */
function defaultBreakfastServiceDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const today = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  return hour < 12 ? today : addCalendarDays(today, 1);
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
    const serviceDate = defaultBreakfastServiceDate();

    let providerId = "";
    let locationId = "";

    const existing = await sql<{ id: string; location_id: string }[]>`
      SELECT p.id, pl.id AS location_id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = ${PHO.slug}
      LIMIT 1
    `;

    if (existing[0]) {
      providerId = existing[0].id;
      locationId = existing[0].location_id;
      console.log("Breakfast provider already seeded:", PHO.slug);
    } else {
      await sql.begin(async (tx) => {
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${PHO.slug}, ${PHO.brandName}, ${PHO.type}, ${"ACTIVE"})
          RETURNING id
        `;
        if (!provider) throw new Error("Failed to create provider");
        providerId = provider.id;

        const [location] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (
            provider_id, slug, display_name, status, address_line, lat, lng
          ) VALUES (
            ${provider.id}::uuid,
            ${PHO.locationSlug},
            ${PHO.displayName},
            ${"ACTIVE"},
            ${PHO.address},
            ${PHO.lat},
            ${PHO.lng}
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
          VALUES (${location.id}::uuid, ${"OPEN"}, ${"Nhận preorder sáng tới 23:30"})
        `;
      });
      console.log("Seeded breakfast provider:", PHO.brandName);
    }

    await sql`
      INSERT INTO provider_profiles (provider_id, tagline)
      VALUES (${providerId}::uuid, ${PHO.tagline})
      ON CONFLICT (provider_id) DO UPDATE SET tagline = ${PHO.tagline}
    `;

    const offeringIds: { id: string; name: string; description: string | null; price: number }[] =
      [];

    for (const [idx, item] of OFFERINGS.entries()) {
      const existingOff = await sql<{ id: string }[]>`
        SELECT id FROM offerings
        WHERE provider_id = ${providerId}::uuid AND slug = ${item.slug}
        LIMIT 1
      `;
      let offeringId = existingOff[0]?.id ?? "";
      if (!offeringId) {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO offerings (
            provider_id, slug, name, description, sort_order, status
          ) VALUES (
            ${providerId}::uuid,
            ${item.slug},
            ${item.name},
            ${item.description},
            ${idx + 1},
            ${"ACTIVE"}
          )
          RETURNING id
        `;
        if (!created) throw new Error(`Failed offering ${item.slug}`);
        offeringId = created.id;
        await sql`
          INSERT INTO offering_prices (
            offering_id, provider_location_id, amount_vnd, pricing_kind
          ) VALUES (
            ${offeringId}::uuid,
            ${locationId}::uuid,
            ${item.amountVnd},
            ${"FIXED"}
          )
        `;
        console.log("  offering →", item.name);
      }
      offeringIds.push({
        id: offeringId,
        name: item.name,
        description: item.description,
        price: item.amountVnd,
      });
    }

    // Reset service date menu/windows
    await sql`
      UPDATE orders
      SET
        status = 'SYSTEM_CANCELLED',
        breakfast_delivery_window_id = NULL,
        updated_at = now()
      WHERE provider_location_id = ${locationId}::uuid
        AND service_date = ${serviceDate}::date
        AND order_kind = 'BREAKFAST_PREORDER'
        AND status NOT IN ('DELIVERED', 'COMPLETED', 'SYSTEM_CANCELLED', 'CUSTOMER_CANCELLED', 'PROVIDER_REJECTED')
    `;
    await sql`
      UPDATE order_items oi
      SET breakfast_menu_item_id = NULL
      FROM orders o
      WHERE oi.order_id = o.id
        AND o.provider_location_id = ${locationId}::uuid
        AND o.service_date = ${serviceDate}::date
        AND o.order_kind = 'BREAKFAST_PREORDER'
    `;
    await sql`
      DELETE FROM breakfast_preorder_delivery_windows
      WHERE provider_location_id = ${locationId}::uuid AND service_date = ${serviceDate}::date
    `;
    await sql`
      DELETE FROM breakfast_preorder_daily_menus
      WHERE provider_location_id = ${locationId}::uuid AND service_date = ${serviceDate}::date
    `;

    await sql`
      INSERT INTO breakfast_preorder_provider_settings (
        provider_location_id, enabled, cutoff_time, open_from_time, daily_capacity
      ) VALUES (
        ${locationId}::uuid, false, ${PHO.cutoff}::time, ${PHO.openFrom}::time, 60
      )
      ON CONFLICT (provider_location_id) DO UPDATE
        SET enabled = false,
            cutoff_time = ${PHO.cutoff}::time,
            open_from_time = ${PHO.openFrom}::time,
            daily_capacity = 60,
            updated_at = now()
    `;

    const ownerId = await ensureUser(sql, PHO.ownerPhone, PHO.ownerName);
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

    // Optionally enable breakfast on existing food stall Cơm Tấm
    const comTam = await sql<{ location_id: string }[]>`
      SELECT pl.id AS location_id
      FROM providers p
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      WHERE p.slug = 'com-tam-kim-van'
      LIMIT 1
    `;
    if (comTam[0]) {
      await sql`
        INSERT INTO breakfast_preorder_provider_settings (
          provider_location_id, enabled, cutoff_time, open_from_time, daily_capacity
        ) VALUES (
          ${comTam[0].location_id}::uuid, false, '23:30'::time, '20:00'::time, 40
        )
        ON CONFLICT (provider_location_id) DO NOTHING
      `;
      console.log("  breakfast settings ready on com-tam-kim-van (disabled)");
    }

    const demoMode = process.env.BF_SEED_DEMO === "1" || process.env.BF_SEED_DEMO === "true";
    if (demoMode) {
      const demoWindows = (() => {
        const slots: { start: string; end: string; cap: number }[] = [];
        const pad = (n: number) => String(n).padStart(2, "0");
        for (let m = 6 * 60; m + 15 <= 8 * 60 + 30; m += 15) {
          const sh = Math.floor(m / 60);
          const sm = m % 60;
          const eh = Math.floor((m + 15) / 60);
          const em = (m + 15) % 60;
          slots.push({
            start: `${pad(sh)}:${pad(sm)}`,
            end: `${pad(eh)}:${pad(em)}`,
            cap: 15,
          });
        }
        return slots;
      })();

      const [menu] = await sql<{ id: string }[]>`
        INSERT INTO breakfast_preorder_daily_menus (
          provider_location_id, service_date, status, published_at
        ) VALUES (
          ${locationId}::uuid, ${serviceDate}::date, 'PUBLISHED', now()
        )
        RETURNING id
      `;
      if (!menu) throw new Error("Failed to insert demo breakfast menu");

      for (const [idx, off] of offeringIds.entries()) {
        await sql`
          INSERT INTO breakfast_preorder_menu_items (
            daily_menu_id, offering_id, name, description, price_vnd,
            capacity, remaining_capacity, sort_order, status
          ) VALUES (
            ${menu.id}::uuid,
            ${off.id}::uuid,
            ${off.name},
            ${off.description},
            ${off.price},
            40,
            40,
            ${idx},
            'ACTIVE'
          )
        `;
      }
      for (const w of demoWindows) {
        await sql`
          INSERT INTO breakfast_preorder_delivery_windows (
            provider_location_id, service_date, starts_at, ends_at,
            capacity, remaining_capacity, status
          ) VALUES (
            ${locationId}::uuid,
            ${serviceDate}::date,
            ${w.start}::time,
            ${w.end}::time,
            ${w.cap},
            ${w.cap},
            'OPEN'
          )
        `;
      }
      await sql`
        UPDATE breakfast_preorder_provider_settings
        SET enabled = true, updated_at = now()
        WHERE provider_location_id = ${locationId}::uuid
      `;
      console.log("BF_SEED_DEMO: published menu for", serviceDate, "+ receiving open");
    } else {
      console.log("Blank reset — provider creates menu in UI (BF_SEED_DEMO=1 for demo menu)");
    }

    console.log("Breakfast seed ok");
    console.log("  Provider:", PHO.ownerPhone, "(UI: 0908888015) →", PHO.brandName);
    console.log("  Service date:", serviceDate, "| today (VN):", vnToday());
  } finally {
    await sql.end({ timeout: 5 });
  }
}

seed().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
