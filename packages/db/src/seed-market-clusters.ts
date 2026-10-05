import { createPickiDb } from "./client.js";
import { migrate } from "./migrator.js";
import { FRESH_CATEGORY } from "@picki/shared";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const ZONE = "kim-van-kim-lu";

type Stall = {
  providerSlug: string;
  brandName: string;
  locationSlug: string;
  displayName: string;
  providerType: "MARKET_VENDOR" | "SPECIALTY_STORE" | "CONVENIENCE_STORE";
  categoryId: string;
  clusterSlug: string | null;
  stallCode: string | null;
  address: string;
  lat: number;
  lng: number;
  tagline: string;
  offeringSlug: string;
  offeringName: string;
  priceVnd: number;
  postTitle: string | null;
};

const STALLS: Stall[] = [
  {
    providerSlug: "quay-thit-co-huong",
    brandName: "Quầy thịt cô Hương",
    locationSlug: "quay-thit-co-huong",
    displayName: "Cô Hương",
    providerType: "MARKET_VENDOR",
    categoryId: FRESH_CATEGORY.meat,
    clusterSlug: "cho-kim-lu",
    stallCode: "B12",
    address: "Chợ Kim Lũ",
    lat: 20.9702,
    lng: 105.8134,
    tagline: "Thịt lợn trong chợ",
    offeringSlug: "nac-vai",
    offeringName: "Nạc vai",
    priceVnd: 140_000,
    postTitle: null,
  },
  {
    providerSlug: "quay-rau-co-lan",
    brandName: "Quầy rau cô Lan",
    locationSlug: "quay-rau-co-lan",
    displayName: "Cô Lan",
    providerType: "MARKET_VENDOR",
    categoryId: FRESH_CATEGORY.veg,
    clusterSlug: "cho-kim-lu",
    stallCode: "R4",
    address: "Chợ Kim Lũ",
    lat: 20.9704,
    lng: 105.8136,
    tagline: "Rau trong chợ",
    offeringSlug: "rau-muong",
    offeringName: "Rau muống",
    priceVnd: 15_000,
    postTitle: null,
  },
  {
    providerSlug: "quay-rau-ct12",
    brandName: "Quầy rau CT12",
    locationSlug: "quay-rau-ct12",
    displayName: "Cô Năm",
    providerType: "MARKET_VENDOR",
    categoryId: FRESH_CATEGORY.veg,
    clusterSlug: "cho-ct12",
    stallCode: "R1",
    address: "Ki-ốt chân đế CT12",
    lat: 20.98842,
    lng: 105.84228,
    tagline: "Rau ở cụm ki-ốt CT12",
    offeringSlug: "cai-thao",
    offeringName: "Cải thảo",
    priceVnd: 20_000,
    postTitle: null,
  },
  {
    providerSlug: "hai-san-co-mai",
    brandName: "Hải sản cô Mai",
    locationSlug: "hai-san-co-mai",
    displayName: "Cô Mai",
    providerType: "SPECIALTY_STORE",
    categoryId: FRESH_CATEGORY.seafood,
    clusterSlug: "cho-ct12",
    stallCode: "A2",
    address: "Ki-ốt chân đế CT12",
    lat: 20.98848,
    lng: 105.8424,
    tagline: "Hải sản tươi",
    offeringSlug: "tom-su",
    offeringName: "Tôm sú",
    priceVnd: 320_000,
    postTitle: "Tôm sú sống hôm nay",
  },
  {
    providerSlug: "hoa-qua-chi-huong",
    brandName: "Hoa quả & đồ quê chị Hương",
    locationSlug: "hoa-qua-chi-huong",
    displayName: "Chị Hương",
    providerType: "SPECIALTY_STORE",
    categoryId: FRESH_CATEGORY.fruit,
    clusterSlug: null,
    stallCode: null,
    address: "Nhà mặt đất Kim Lũ",
    lat: 20.9711,
    lng: 105.8142,
    tagline: "Trái cây và đồ quê",
    offeringSlug: "cam-cao-phong",
    offeringName: "Cam Cao Phong",
    priceVnd: 40_000,
    postTitle: null,
  },
  {
    providerSlug: "circle-k-kim-van",
    brandName: "Circle K Kim Văn",
    locationSlug: "circle-k-kim-van",
    displayName: "Circle K Kim Văn",
    providerType: "CONVENIENCE_STORE",
    categoryId: "a1000003-0000-4000-8000-000000000005",
    clusterSlug: null,
    stallCode: null,
    address: "Chân đế CT12 Kim Văn",
    lat: 20.9882,
    lng: 105.8421,
    tagline: "Mở cửa 24/7",
    offeringSlug: "nuoc-suoi",
    offeringName: "Nước suối",
    priceVnd: 8_000,
    postTitle: null,
  },
];

async function main() {
  const { sql } = createPickiDb(databaseUrl!);
  await migrate({ databaseUrl: databaseUrl! });
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM zones WHERE slug = ${ZONE} LIMIT 1`;
  if (!zone) throw new Error(`Zone ${ZONE} not found`);

  await sql`
    INSERT INTO product_categories (id, parent_id, name, type, sort_order)
    VALUES (${FRESH_CATEGORY.country}::uuid, NULL, 'Đồ quê', 'FRESH', 70)
    ON CONFLICT (id) DO NOTHING
  `;

  const places = [
    { code: "CHO-KIM-LU", kind: "TRADITIONAL_MARKET", name: "Chợ Kim Lũ" },
    { code: "CHO-CT12", kind: "RESIDENTIAL_PODIUM_CLUSTER", name: "Cụm ki-ốt CT12" },
  ];
  const placeIds = new Map<string, string>();
  for (const place of places) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO zone_places (zone_id, kind, code, display_name)
      VALUES (${zone.id}::uuid, ${place.kind}, ${place.code}, ${place.name})
      ON CONFLICT (zone_id, code) DO UPDATE SET display_name = EXCLUDED.display_name
      RETURNING id
    `;
    placeIds.set(place.code, row!.id);
  }

  const clusters = [
    {
      slug: "cho-kim-lu",
      name: "Chợ Kim Lũ",
      format: "TRADITIONAL_MARKET",
      place: "CHO-KIM-LU",
    },
    {
      slug: "cho-ct12",
      name: "Chợ CT12",
      format: "KIOSK_CLUSTER",
      place: "CHO-CT12",
    },
  ];
  const clusterIds = new Map<string, string>();
  for (const cluster of clusters) {
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO market_clusters (
        zone_id, name, slug, cluster_format, origin_zone_place_id, status
      ) VALUES (
        ${zone.id}::uuid,
        ${cluster.name},
        ${cluster.slug},
        ${cluster.format},
        ${placeIds.get(cluster.place)!}::uuid,
        'ACTIVE'
      )
      ON CONFLICT (zone_id, slug) DO UPDATE
        SET name = EXCLUDED.name,
            cluster_format = EXCLUDED.cluster_format,
            origin_zone_place_id = EXCLUDED.origin_zone_place_id,
            status = 'ACTIVE',
            updated_at = now()
      RETURNING id
    `;
    clusterIds.set(cluster.slug, row!.id);
  }

  for (const stall of STALLS) {
    const [provider] = await sql<{ id: string }[]>`
      INSERT INTO providers (slug, brand_name, provider_type, status, primary_category_id)
      VALUES (
        ${stall.providerSlug},
        ${stall.brandName},
        ${stall.providerType},
        'ACTIVE',
        ${stall.categoryId}::uuid
      )
      ON CONFLICT (slug) DO UPDATE
        SET brand_name = EXCLUDED.brand_name,
            provider_type = EXCLUDED.provider_type,
            status = 'ACTIVE',
            primary_category_id = EXCLUDED.primary_category_id,
            updated_at = now()
      RETURNING id
    `;
    const clusterId = stall.clusterSlug ? clusterIds.get(stall.clusterSlug)! : null;
    const [location] = await sql<{ id: string }[]>`
      INSERT INTO provider_locations (
        provider_id, slug, display_name, status, address_line, lat, lng,
        market_cluster_id, stall_code
      ) VALUES (
        ${provider!.id}::uuid,
        ${stall.locationSlug},
        ${stall.displayName},
        'ACTIVE',
        ${stall.address},
        ${stall.lat},
        ${stall.lng},
        ${clusterId}::uuid,
        ${stall.stallCode}
      )
      ON CONFLICT (provider_id, slug) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            status = 'ACTIVE',
            address_line = EXCLUDED.address_line,
            lat = EXCLUDED.lat,
            lng = EXCLUDED.lng,
            market_cluster_id = EXCLUDED.market_cluster_id,
            stall_code = EXCLUDED.stall_code,
            updated_at = now()
      RETURNING id
    `;
    await sql`
      INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
      VALUES (${location!.id}::uuid, ${zone.id}::uuid, 'ACTIVE')
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO provider_profiles (provider_id, tagline)
      VALUES (${provider!.id}::uuid, ${stall.tagline})
      ON CONFLICT (provider_id) DO UPDATE SET tagline = EXCLUDED.tagline
    `;
    await sql`
      INSERT INTO provider_live_status (provider_location_id, status, message)
      VALUES (${location!.id}::uuid, 'OPEN', ${stall.tagline})
      ON CONFLICT (provider_location_id) DO UPDATE
        SET status = 'OPEN', message = EXCLUDED.message, updated_at = now()
    `;
    const [offering] = await sql<{ id: string }[]>`
      INSERT INTO offerings (provider_id, slug, name, offering_type, status, unit, category_id)
      VALUES (
        ${provider!.id}::uuid, ${stall.offeringSlug}, ${stall.offeringName}, 'PRODUCT', 'ACTIVE', 'phần', ${stall.categoryId}::uuid
      )
      ON CONFLICT (provider_id, slug) DO UPDATE
        SET name = EXCLUDED.name, status = 'ACTIVE', category_id = EXCLUDED.category_id, updated_at = now()
      RETURNING id
    `;
    await sql`
      INSERT INTO offering_prices (offering_id, provider_location_id, amount_vnd, pricing_kind)
      VALUES (${offering!.id}::uuid, ${location!.id}::uuid, ${stall.priceVnd}, 'FIXED')
      ON CONFLICT (offering_id, provider_location_id) WHERE provider_location_id IS NOT NULL
      DO UPDATE SET amount_vnd = EXCLUDED.amount_vnd
    `;
    if (stall.postTitle) {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM provider_daily_updates
        WHERE provider_location_id = ${location!.id}::uuid AND title = ${stall.postTitle}
        LIMIT 1
      `;
      let updateId = existing?.id;
      if (!updateId) {
        const [created] = await sql<{ id: string }[]>`
          INSERT INTO provider_daily_updates (
            provider_location_id, update_type, title, linked_entity_type, linked_entity_id,
            suggested_surface, approved_surface, valid_from, expires_at, status
          ) VALUES (
            ${location!.id}::uuid,
            'DAILY_SPECIAL',
            ${stall.postTitle},
            'OFFERING',
            ${offering!.id}::uuid,
            'MARKET_TODAY',
            'MARKET_TODAY',
            now(),
            now() + interval '3 days',
            'ACTIVE'
          )
          RETURNING id
        `;
        updateId = created!.id;
      }
      await sql`
        INSERT INTO provider_daily_update_zone_targets (
          update_id, zone_id, review_status, approved_surface, reviewed_at
        ) VALUES (
          ${updateId}::uuid, ${zone.id}::uuid, 'APPROVED', 'MARKET_TODAY', now()
        )
        ON CONFLICT (update_id, zone_id) DO UPDATE
          SET review_status = 'APPROVED', approved_surface = 'MARKET_TODAY'
      `;
    }
    console.log(stall.brandName);
  }

  console.log("P6.1 market clusters seeded");
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
