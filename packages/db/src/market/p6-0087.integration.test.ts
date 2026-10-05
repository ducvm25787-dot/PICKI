import { afterAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { marketZoneMismatch } from "@picki/shared";

const databaseUrl = process.env.DATABASE_URL ?? "";

function pgCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

describe.skipIf(!databaseUrl)("P6 0087 market cluster", () => {
  const { sql } = createPickiDb(databaseUrl);

  afterAll(async () => {
    await sql.end();
  });

  it("enforces service date, stall codes, context, and zone membership", async () => {
    const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'market_clusters_zone_status_idx',
        'provider_locations_market_cluster_idx',
        'provider_locations_cluster_stall_uidx',
        'orders_market_basket_idx',
        'market_baskets_customer_date_idx'
      )
    `;
    expect(indexes.map((row) => row.indexname).sort()).toEqual([
      "market_baskets_customer_date_idx",
      "market_clusters_zone_status_idx",
      "orders_market_basket_idx",
      "provider_locations_cluster_stall_uidx",
      "provider_locations_market_cluster_idx",
    ]);

    await expect(
      sql.begin(async (tx) => {
        let savepoint = 0;
        async function expectCode(code: string, run: () => Promise<unknown>) {
          const name = `p6_${savepoint++}`;
          await tx.unsafe(`SAVEPOINT ${name}`);
          try {
            await run();
          } catch (error) {
            if (pgCode(error) !== code) throw error;
            await tx.unsafe(`ROLLBACK TO SAVEPOINT ${name}`);
            await tx.unsafe(`RELEASE SAVEPOINT ${name}`);
            return;
          }
          await tx.unsafe(`RELEASE SAVEPOINT ${name}`);
          throw new Error(`expected ${code}`);
        }

        const stamp = `${Date.now()}`;
        const [city] = await tx<{ id: string }[]>`SELECT id FROM experience_cities LIMIT 1`;
        const [zoneA] = await tx<{ id: string }[]>`
          INSERT INTO zones (slug, name, display_name, city_id, anchor_lng, anchor_lat, status)
          VALUES (${`p6-a-${stamp}`}, 'A', 'A', ${city!.id}::uuid, 105.84, 20.97, 'ACTIVE')
          RETURNING id
        `;
        const [zoneB] = await tx<{ id: string }[]>`
          INSERT INTO zones (slug, name, display_name, city_id, anchor_lng, anchor_lat, status)
          VALUES (${`p6-b-${stamp}`}, 'B', 'B', ${city!.id}::uuid, 105.85, 20.98, 'ACTIVE')
          RETURNING id
        `;
        const [place] = await tx<{ id: string }[]>`
          INSERT INTO zone_places (zone_id, kind, code, display_name)
          VALUES (${zoneA!.id}::uuid, 'TRADITIONAL_MARKET', ${`p6-${stamp}`}, 'Chợ thử')
          RETURNING id
        `;
        await expectCode("23514", () => tx`
          INSERT INTO zone_places (zone_id, kind, code, display_name)
          VALUES (${zoneA!.id}::uuid, 'MARKET_CLUSTER', ${`bad-${stamp}`}, 'Không phải kind')
        `);
        await expectCode("23514", () => tx`
          INSERT INTO market_clusters (zone_id, name, slug, cluster_format, status)
          VALUES (${zoneA!.id}::uuid, 'Mở thiếu gốc', ${`open-${stamp}`}, 'KIOSK_CLUSTER', 'ACTIVE')
        `);

        const [clusterA] = await tx<{ id: string }[]>`
          INSERT INTO market_clusters (zone_id, name, slug, cluster_format, origin_zone_place_id, status)
          VALUES (
            ${zoneA!.id}::uuid, 'Chợ CT12', ${`ct12-${stamp}`}, 'KIOSK_CLUSTER', ${place!.id}::uuid, 'ACTIVE'
          )
          RETURNING id
        `;
        const [clusterB] = await tx<{ id: string }[]>`
          INSERT INTO market_clusters (zone_id, name, slug, cluster_format, status)
          VALUES (${zoneA!.id}::uuid, 'Chợ khác', ${`other-${stamp}`}, 'TRADITIONAL_MARKET', 'DRAFT')
          RETURNING id
        `;
        const [provider] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${`mai-${stamp}`}, 'Hải sản cô Mai', 'SPECIALTY_STORE', 'ACTIVE')
          RETURNING id
        `;
        const [stall] = await tx<{ id: string }[]>`
          INSERT INTO provider_locations (provider_id, slug, display_name, status, market_cluster_id, stall_code)
          VALUES (${provider!.id}::uuid, ${`mai-${stamp}`}, 'Hải sản cô Mai', 'ACTIVE', ${clusterA!.id}::uuid, 'B12')
          RETURNING id
        `;
        const [neighbor] = await tx<{ id: string }[]>`
          INSERT INTO providers (slug, brand_name, provider_type, status)
          VALUES (${`lan-${stamp}`}, 'Rau cô Lan', 'MARKET_VENDOR', 'ACTIVE')
          RETURNING id
        `;
        await expectCode("23505", () => tx`
          INSERT INTO provider_locations (provider_id, slug, display_name, status, market_cluster_id, stall_code)
          VALUES (${neighbor!.id}::uuid, ${`lan-${stamp}`}, 'Rau cô Lan', 'ACTIVE', ${clusterA!.id}::uuid, 'B12')
        `);
        await tx`
          INSERT INTO provider_locations (provider_id, slug, display_name, status, market_cluster_id, stall_code)
          VALUES (${neighbor!.id}::uuid, ${`lan-${stamp}`}, 'Rau cô Lan', 'ACTIVE', ${clusterB!.id}::uuid, 'B12')
        `;
        await expectCode("23505", () => tx`
          UPDATE provider_locations
          SET market_cluster_id = ${clusterB!.id}::uuid
          WHERE id = ${stall!.id}::uuid
        `);
        await tx`
          UPDATE provider_locations
          SET stall_code = 'B13', market_cluster_id = ${clusterB!.id}::uuid
          WHERE id = ${stall!.id}::uuid
        `;
        const [moved] = await tx<{ market_cluster_id: string; stall_code: string }[]>`
          SELECT market_cluster_id, stall_code FROM provider_locations WHERE id = ${stall!.id}::uuid
        `;
        expect(moved!.market_cluster_id).toBe(clusterB!.id);
        expect(moved!.stall_code).toBe("B13");
        await tx`
          UPDATE provider_locations
          SET stall_code = 'B12', market_cluster_id = ${clusterA!.id}::uuid
          WHERE id = ${stall!.id}::uuid
        `;
        await tx`
          INSERT INTO provider_zone_memberships (provider_location_id, zone_id, status)
          VALUES (${stall!.id}::uuid, ${zoneA!.id}::uuid, 'ACTIVE')
        `;

        const [customer] = await tx<{ id: string }[]>`
          INSERT INTO users (display_name) VALUES ('P6') RETURNING id
        `;
        await expectCode("23502", () => tx`
          INSERT INTO market_baskets (customer_user_id, zone_id, market_cluster_id, ordering_mode, service_date)
          VALUES (${customer!.id}::uuid, ${zoneA!.id}::uuid, ${clusterA!.id}::uuid, 'PREORDER', NULL)
        `);
        const [basket] = await tx<{ id: string }[]>`
          INSERT INTO market_baskets (
            customer_user_id, zone_id, market_cluster_id, ordering_mode, service_date
          )
          VALUES (
            ${customer!.id}::uuid, ${zoneA!.id}::uuid, ${clusterA!.id}::uuid, 'PREORDER', '2026-10-06'
          )
          RETURNING id
        `;
        const [foreignBasket] = await tx<{ id: string; zone_id: string }[]>`
          INSERT INTO market_baskets (
            customer_user_id, zone_id, market_cluster_id, ordering_mode, service_date
          )
          VALUES (
            ${customer!.id}::uuid, ${zoneB!.id}::uuid, ${clusterA!.id}::uuid, 'ON_DEMAND', '2026-10-05'
          )
          RETURNING id, zone_id
        `;
        expect(
          marketZoneMismatch({
            clusterId: clusterA!.id,
            clusterZoneId: zoneA!.id,
            basketZoneId: foreignBasket!.zone_id,
            stalls: [{ marketClusterId: clusterA!.id, servingZoneIds: [zoneA!.id] }],
          }),
        ).toBe("BASKET_ZONE");
        expect(
          marketZoneMismatch({
            clusterId: clusterA!.id,
            clusterZoneId: zoneA!.id,
            basketZoneId: zoneA!.id,
            stalls: [{ marketClusterId: clusterA!.id, servingZoneIds: [zoneA!.id] }],
          }),
        ).toBeNull();

        const [legacy] = await tx<{ commerce_context: string; market_basket_id: string | null }[]>`
          INSERT INTO orders (
            order_number, customer_user_id, zone_id, provider_location_id, subtotal_vnd, total_vnd
          )
          VALUES (
            ${`p6-legacy-${stamp}`}, ${customer!.id}::uuid, ${zoneA!.id}::uuid, ${stall!.id}::uuid, 1000, 1000
          )
          RETURNING commerce_context, market_basket_id
        `;
        expect(legacy!.commerce_context).toBe("UNSPECIFIED");
        expect(legacy!.market_basket_id).toBeNull();
        await expectCode("23514", () => tx`
          INSERT INTO orders (
            order_number, customer_user_id, zone_id, provider_location_id, subtotal_vnd, total_vnd, commerce_context
          )
          VALUES (
            ${`p6-trip-nobasket-${stamp}`}, ${customer!.id}::uuid, ${zoneA!.id}::uuid,
            ${stall!.id}::uuid, 1000, 1000, 'MARKET_TRIP'
          )
        `);
        await tx`
          INSERT INTO orders (
            order_number, customer_user_id, zone_id, provider_location_id, subtotal_vnd, total_vnd, commerce_context
          )
          VALUES (
            ${`p6-direct-${stamp}`}, ${customer!.id}::uuid, ${zoneA!.id}::uuid,
            ${stall!.id}::uuid, 2000, 2000, 'DIRECT'
          )
        `;
        await tx`
          INSERT INTO orders (
            order_number, customer_user_id, zone_id, provider_location_id, subtotal_vnd, total_vnd,
            commerce_context, market_basket_id
          )
          VALUES (
            ${`p6-trip-${stamp}`}, ${customer!.id}::uuid, ${zoneA!.id}::uuid,
            ${stall!.id}::uuid, 3000, 3000, 'MARKET_TRIP', ${basket!.id}::uuid
          )
        `;
        const [ordersForStall] = await tx<{ contexts: string }[]>`
          SELECT string_agg(commerce_context, ',' ORDER BY commerce_context) AS contexts
          FROM orders
          WHERE provider_location_id = ${stall!.id}::uuid
        `;
        expect(ordersForStall!.contexts).toBe("DIRECT,MARKET_TRIP,UNSPECIFIED");
        const [locationCount] = await tx<{ n: number }[]>`
          SELECT count(*)::int AS n FROM provider_locations WHERE provider_id = ${provider!.id}::uuid
        `;
        expect(locationCount!.n).toBe(1);

        await expectCode("23514", () => tx`
          INSERT INTO scheduled_fulfillment_settings (
            provider_location_id, purpose, cutoff_time, prepare_lead_minutes, slots
          )
          VALUES (${stall!.id}::uuid, 'MARKET_TRIP', '22:00', 30, '[]'::jsonb)
        `);

        throw new Error("ROLLBACK");
      }),
    ).rejects.toThrow("ROLLBACK");
  });
});
