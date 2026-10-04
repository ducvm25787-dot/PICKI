import type postgres from "postgres";
import { expandQueryTerms, normalizeSearchQuery } from "./normalize.js";

export type UniversalSearchKind =
  | "provider"
  | "offering"
  | "menu_item"
  | "category";

export type UniversalSearchRow = {
  kind: UniversalSearchKind;
  location_id: string | null;
  provider_id: string | null;
  brand_name: string | null;
  display_name: string | null;
  live_status: string | null;
  item_id: string | null;
  item_name: string | null;
  item_subtitle: string | null;
  amount_vnd: number | null;
  href_hint: string | null;
  lat: number | null;
  lng: number | null;
  familiar: boolean;
};

export type SearchGroupId = "familiar" | "items" | "providers" | "categories" | "discover";

export type SearchGroup = {
  id: SearchGroupId;
  title: string;
  results: UniversalSearchRow[];
};

async function loadSynonyms(sql: postgres.Sql): Promise<{ variant: string; canonical: string }[]> {
  try {
    return await sql<{ variant: string; canonical: string }[]>`
      SELECT variant, canonical FROM search_synonyms
    `;
  } catch {
    return [];
  }
}

function likePattern(term: string): string {
  return `%${term.replace(/[%_]/g, "")}%`;
}

/** Universal Zone search — providers, offerings, FD/BF menu items, categories. */
export async function searchZoneUniversal(
  sql: postgres.Sql,
  opts: {
    zoneId: string;
    query: string;
    familiarLocationIds?: string[];
    includeDraftBeer?: boolean;
  },
): Promise<SearchGroup[]> {
  const q = opts.query.trim();
  if (!q) return [];

  const synonyms = await loadSynonyms(sql);
  const terms = expandQueryTerms(q, synonyms);
  const patterns = terms.map(likePattern);
  const familiarIds = opts.familiarLocationIds ?? [];

  const rows = await sql<UniversalSearchRow[]>`
    WITH terms AS (
      SELECT unnest(${patterns}::text[]) AS pat
    )
    SELECT * FROM (
      -- Providers
      SELECT
        'provider'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        NULL::uuid AS item_id,
        NULL::text AS item_name,
        pp.tagline AS item_subtitle,
        NULL::integer AS amount_vnd,
        ('/locations/' || pl.id::text) AS href_hint,
        pl.lat,
        pl.lng,
        (pl.id = ANY(${familiarIds}::uuid[])) AS familiar
      FROM provider_zone_memberships pzm
      INNER JOIN provider_locations pl ON pl.id = pzm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      LEFT JOIN provider_profiles pp ON pp.provider_id = p.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${opts.zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND EXISTS (
          SELECT 1 FROM terms t
          WHERE p.brand_name ILIKE t.pat
             OR pl.display_name ILIKE t.pat
             OR COALESCE(pp.tagline, '') ILIKE t.pat
             OR picki_unaccent(lower(p.brand_name)) ILIKE t.pat
             OR picki_unaccent(lower(pl.display_name)) ILIKE t.pat
        )

      UNION ALL

      -- Catalog offerings
      SELECT
        'offering'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        o.id AS item_id,
        o.name AS item_name,
        o.description AS item_subtitle,
        COALESCE(op.amount_vnd, opm.amount_vnd) AS amount_vnd,
        ('/locations/' || pl.id::text) AS href_hint,
        pl.lat,
        pl.lng,
        (pl.id = ANY(${familiarIds}::uuid[])) AS familiar
      FROM offerings o
      INNER JOIN providers p ON p.id = o.provider_id
      INNER JOIN provider_locations pl ON pl.provider_id = p.id
      INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      LEFT JOIN offering_prices op ON op.offering_id = o.id AND op.provider_location_id = pl.id
      LEFT JOIN offering_prices opm ON opm.offering_id = o.id AND opm.provider_location_id IS NULL
      WHERE pzm.zone_id = ${opts.zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND o.status = 'ACTIVE'
        AND (${opts.includeDraftBeer === true} OR o.alcohol_restricted = false)
        AND EXISTS (
          SELECT 1 FROM terms t
          WHERE o.name ILIKE t.pat
             OR COALESCE(o.description, '') ILIKE t.pat
             OR picki_unaccent(lower(o.name)) ILIKE t.pat
        )

      UNION ALL

      -- Family Dinner menu items (today / recent published menus)
      SELECT
        'menu_item'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        fi.id AS item_id,
        fi.name AS item_name,
        ('Bữa tối · ' || fi.category) AS item_subtitle,
        fi.price_vnd AS amount_vnd,
        ('/family-dinner/' || pl.id::text) AS href_hint,
        pl.lat,
        pl.lng,
        (pl.id = ANY(${familiarIds}::uuid[])) AS familiar
      FROM family_dinner_menu_items fi
      INNER JOIN family_dinner_daily_menus fdm ON fdm.id = fi.daily_menu_id
      INNER JOIN provider_locations pl ON pl.id = fdm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${opts.zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND fdm.status = 'PUBLISHED'
        AND fdm.service_date >= (CURRENT_DATE - 1)
        AND fdm.service_date <= (CURRENT_DATE + 1)
        AND fi.status IN ('ACTIVE', 'SOLD_OUT')
        AND (
          ${opts.includeDraftBeer === true}
          OR (fi.name <> 'Bia hơi' AND fi.name NOT ILIKE 'Bia hơi %')
        )
        AND EXISTS (
          SELECT 1 FROM terms t
          WHERE fi.name ILIKE t.pat
             OR COALESCE(fi.description, '') ILIKE t.pat
             OR picki_unaccent(lower(fi.name)) ILIKE t.pat
        )

      UNION ALL

      -- Breakfast preorder menu items
      SELECT
        'menu_item'::text AS kind,
        pl.id AS location_id,
        p.id AS provider_id,
        p.brand_name,
        pl.display_name,
        COALESCE(pls.status, 'OFFLINE') AS live_status,
        bi.id AS item_id,
        bi.name AS item_name,
        'Sáng mai'::text AS item_subtitle,
        bi.price_vnd AS amount_vnd,
        ('/breakfast/' || pl.id::text) AS href_hint,
        pl.lat,
        pl.lng,
        (pl.id = ANY(${familiarIds}::uuid[])) AS familiar
      FROM breakfast_preorder_menu_items bi
      INNER JOIN breakfast_preorder_daily_menus bdm ON bdm.id = bi.daily_menu_id
      INNER JOIN provider_locations pl ON pl.id = bdm.provider_location_id
      INNER JOIN providers p ON p.id = pl.provider_id
      INNER JOIN provider_zone_memberships pzm ON pzm.provider_location_id = pl.id
      LEFT JOIN provider_live_status pls ON pls.provider_location_id = pl.id
      WHERE pzm.zone_id = ${opts.zoneId}::uuid
        AND pzm.status = 'ACTIVE' AND pl.status = 'ACTIVE' AND p.status = 'ACTIVE'
        AND bdm.status = 'PUBLISHED'
        AND bdm.daypart = 'BREAKFAST'
        AND bdm.service_date >= CURRENT_DATE
        AND bdm.service_date <= (CURRENT_DATE + 2)
        AND bi.status IN ('ACTIVE', 'SOLD_OUT')
        AND (
          ${opts.includeDraftBeer === true}
          OR (bi.name <> 'Bia hơi' AND bi.name NOT ILIKE 'Bia hơi %')
        )
        AND EXISTS (
          SELECT 1 FROM terms t
          WHERE bi.name ILIKE t.pat
             OR COALESCE(bi.description, '') ILIKE t.pat
             OR picki_unaccent(lower(bi.name)) ILIKE t.pat
        )
    ) results
    LIMIT 60
  `;

  // Static category hits (client HOME_CATEGORIES mirrored lightly)
  const categoryHits = matchCategories(terms);

  return groupSearchResults(rows, categoryHits, familiarIds);
}

const CATEGORY_INDEX: { id: string; label: string; keywords: string[]; href: string }[] = [
  { id: "food", label: "Ăn uống", keywords: ["an uong", "food", "com", "pho", "bun", "an"], href: "/zones/kim-van-kim-lu/browse/food" },
  { id: "market", label: "Đi chợ", keywords: ["di cho", "cho", "tap hoa", "market"], href: "/zones/kim-van-kim-lu/browse/market" },
  { id: "beauty", label: "Làm đẹp", keywords: ["lam dep", "toc", "cat toc", "nail", "beauty"], href: "/zones/kim-van-kim-lu/browse/beauty" },
  { id: "cleaning", label: "Giặt / dọn", keywords: ["giat", "don nha", "laundry", "giup viec"], href: "/zones/kim-van-kim-lu/browse/cleaning" },
  { id: "repair", label: "Sửa chữa", keywords: ["sua", "dien", "nuoc", "dieu hoa", "sua lanh"], href: "/zones/kim-van-kim-lu/browse/repair" },
  { id: "education", label: "Học thêm", keywords: ["hoc", "gia su", "edu"], href: "/zones/kim-van-kim-lu/browse/education" },
  { id: "pet", label: "Thú cưng", keywords: ["pet", "thu cung", "cho", "meo"], href: "/zones/kim-van-kim-lu/browse/pet" },
  { id: "health", label: "Sức khỏe", keywords: ["suc khoe", "phong kham", "nha thuoc"], href: "/zones/kim-van-kim-lu/browse/health" },
];

function matchCategories(terms: string[]): UniversalSearchRow[] {
  const norms = terms.map((t) => normalizeSearchQuery(t));
  const hits: UniversalSearchRow[] = [];
  for (const cat of CATEGORY_INDEX) {
    const matched = norms.some((n) => cat.keywords.some((k) => n.includes(k) || k.includes(n)));
    if (!matched) continue;
    hits.push({
      kind: "category",
      location_id: null,
      provider_id: null,
      brand_name: cat.label,
      display_name: cat.label,
      live_status: null,
      item_id: null,
      item_name: cat.label,
      item_subtitle: "Danh mục",
      amount_vnd: null,
      href_hint: cat.href,
      lat: null,
      lng: null,
      familiar: false,
    });
  }
  return hits;
}

function groupSearchResults(
  rows: UniversalSearchRow[],
  categories: UniversalSearchRow[],
  familiarIds: string[],
): SearchGroup[] {
  const familiar: UniversalSearchRow[] = [];
  const items: UniversalSearchRow[] = [];
  const providers: UniversalSearchRow[] = [];
  const discover: UniversalSearchRow[] = [];
  const seenItem = new Set<string>();
  const seenProv = new Set<string>();

  for (const r of rows) {
    const key =
      r.kind === "provider"
        ? `p:${r.location_id}`
        : `i:${r.kind}:${r.item_id}:${r.location_id}`;
    if (r.kind === "provider") {
      if (seenProv.has(r.location_id ?? "")) continue;
      seenProv.add(r.location_id ?? "");
      if (r.familiar || (r.location_id && familiarIds.includes(r.location_id))) {
        familiar.push({ ...r, familiar: true });
      } else {
        providers.push(r);
      }
    } else {
      if (seenItem.has(key)) continue;
      seenItem.add(key);
      if (r.familiar || (r.location_id && familiarIds.includes(r.location_id))) {
        // Prefer items under familiar group when from familiar shop
        familiar.push({ ...r, familiar: true });
      } else {
        items.push(r);
      }
    }
  }

  // Cap discover: leftover providers not in familiar
  for (const p of providers) {
    if (familiar.length < 6 && p.live_status && ["OPEN", "AVAILABLE_NOW", "BUSY", "SHORT_WAIT"].includes(p.live_status)) {
      discover.push(p);
    }
  }

  const groups: SearchGroup[] = [];
  if (familiar.length) groups.push({ id: "familiar", title: "Chỗ quen", results: familiar.slice(0, 8) });
  if (items.length) groups.push({ id: "items", title: "Món / dịch vụ / sản phẩm", results: items.slice(0, 20) });
  if (providers.length) {
    const rest = providers.filter((p) => !discover.some((d) => d.location_id === p.location_id));
    if (rest.length) groups.push({ id: "providers", title: "Quán / tiệm", results: rest.slice(0, 15) });
  }
  if (categories.length) groups.push({ id: "categories", title: "Danh mục", results: categories });
  if (discover.length) groups.push({ id: "discover", title: "Khám phá", results: discover.slice(0, 8) });

  return groups;
}
