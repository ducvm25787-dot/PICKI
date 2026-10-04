"use client";

import {
  CHAIN_SCOPE_STORAGE_KEY,
  chainConsoleHref,
  decodeChainScope,
  encodeChainScope,
  parseChainScopeQuery,
  resolveStickyChainScope,
  type ChainScopeRef,
} from "@picki/shared";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { CampaignBoard } from "./chain-campaigns";
import { ProviderPageShell, useProviderLocation, type ChainScopeChoice } from "./provider-location-context";

type Scope = ChainScopeChoice;

function ScopeBar({ scopes, active }: { scopes: Scope[]; active: ChainScopeRef }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = `${active.scopeType}:${active.scopeId}`;
  return (
    <label className="chain-scope">
      Phạm vi
      <select
        value={selected}
        onChange={(event) => {
          const next = decodeChainScope(event.target.value);
          if (!next) return;
          sessionStorage.setItem(CHAIN_SCOPE_STORAGE_KEY, encodeChainScope(next));
          router.replace(chainConsoleHref(pathname, next, params.toString()));
        }}
      >
        {scopes.map((scope) => (
          <option key={`${scope.scopeType}:${scope.scopeId}`} value={`${scope.scopeType}:${scope.scopeId}`}>
            {scope.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function openLocation(locationId: string, href: string) {
  sessionStorage.setItem("picki-provider-local", "1");
  sessionStorage.setItem("picki-provider-location", locationId);
  window.location.assign(href);
}

export function ChainPage({
  view,
  locationId,
  offeringId,
}: {
  view: "overview" | "locations" | "location" | "orders" | "products" | "product" | "today" | "members" | "campaigns";
  locationId?: string;
  offeringId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlScope = parseChainScopeQuery(params.toString());
  const { chain, loading, setLocationId } = useProviderLocation();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [remembered, setRemembered] = useState<ChainScopeRef | null>(null);
  const [memoryReady, setMemoryReady] = useState(false);
  const sticky = chain
    ? resolveStickyChainScope({
        url: urlScope,
        remembered: memoryReady ? remembered : null,
        choices: chain.scopes,
        fallback: memoryReady ? chain.scopes[0] ?? null : null,
      })
    : null;
  const scopeQs = sticky
    ? `scopeType=${encodeURIComponent(sticky.scopeType)}&scopeId=${encodeURIComponent(sticky.scopeId)}`
    : "";
  const scopeRejected = Boolean(
    chain && urlScope && !chain.scopes.some((choice) => choice.scopeType === urlScope.scopeType && choice.scopeId === urlScope.scopeId),
  );

  const search = params.toString();

  useEffect(() => {
    setRemembered(decodeChainScope(sessionStorage.getItem(CHAIN_SCOPE_STORAGE_KEY)));
    setMemoryReady(true);
  }, []);

  useEffect(() => {
    const campaignOnly = view === "campaigns" && chain?.canManageCampaigns === true;
    if ((!chain?.chainEnabled && !campaignOnly) || !memoryReady || !sticky || scopeRejected) return;
    sessionStorage.setItem(CHAIN_SCOPE_STORAGE_KEY, encodeChainScope(sticky));
    if (urlScope?.scopeType === sticky.scopeType && urlScope.scopeId === sticky.scopeId) return;
    router.replace(chainConsoleHref(pathname, sticky, search));
  }, [chain?.canManageCampaigns, chain?.chainEnabled, memoryReady, pathname, router, scopeRejected, search, sticky, urlScope, view]);

  const load = useCallback(async () => {
    if (!chain?.chainEnabled || !scopeQs || scopeRejected || view === "campaigns") return;
    const qs = `?${scopeQs}`;
    if (view === "overview") setData(await api(`/provider/organization/overview${qs}`));
    if (view === "locations" || view === "location") setData(await api(`/provider/organization/locations${qs}`));
    if (view === "orders") setData(await api(`/provider/organization/orders${qs}`));
    if (view === "products") setData(await api(`/provider/organization/products${qs}`));
    if (view === "product" && offeringId) setData(await api(`/provider/organization/products/${offeringId}${qs}`));
    if (view === "today") setData(await api(`/provider/organization/today${qs}`));
    if (view === "members") setData(await api(`/provider/organization/members${qs}`));
  }, [chain?.chainEnabled, offeringId, scopeQs, scopeRejected, view]);

  useEffect(() => {
    if (loading || !chain?.chainEnabled || !scopeQs || scopeRejected) return;
    setData(null);
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }, [chain?.chainEnabled, load, loading, scopeQs, scopeRejected]);

  const title =
    view === "overview" ? "Tổng quan" :
    view === "locations" || view === "location" ? "Điểm bán" :
    view === "orders" ? "Đơn hàng" :
    view === "products" || view === "product" ? "Sản phẩm" :
    view === "today" ? "Hôm nay" :
    view === "campaigns" ? "Chương trình" : "Người dùng";

  if (!loading && chain && !chain.chainEnabled && !(view === "campaigns" && chain.canManageCampaigns)) {
    return (
      <ProviderPageShell title="Cửa hàng">
        <div className="card">
          <p>Cửa hàng một điểm bán dùng màn hình hiện tại.</p>
          <Link href="/provider/board">Về Hôm nay</Link>
        </div>
      </ProviderPageShell>
    );
  }

  return (
    <ProviderPageShell title={chain?.brandName || title}>
      {chain && sticky ? <ScopeBar scopes={chain.scopes} active={sticky} /> : null}
      {scopeRejected ? <p className="card">Phạm vi này không còn trong quyền của bạn.</p> : null}
      {error ? <p className="card">{error}</p> : null}
      {notice ? <p className="card">{notice}</p> : null}
      {view === "overview" && data ? <Overview data={data} /> : null}
      {view === "locations" && data ? (
        <Locations data={data} onOpen={(id) => router.push(`/provider/organization/locations/${id}?${scopeQs}`)} />
      ) : null}
      {view === "location" && data && locationId ? (
        <LocationDetail
          data={data}
          locationId={locationId}
          onOpen={(href) => {
            setLocationId(locationId);
            openLocation(locationId, href);
          }}
        />
      ) : null}
      {view === "orders" && data ? (
        <Orders
          data={data}
          onFilter={(next) => {
            const qs = new URLSearchParams(scopeQs);
            if (next.range) qs.set("range", next.range);
            if (next.status) qs.set("status", next.status);
            if (next.locationId) qs.set("locationId", next.locationId);
            if (next.vertical) qs.set("vertical", next.vertical);
            void api<Record<string, unknown>>(`/provider/organization/orders?${qs.toString()}`).then(setData).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : "Không lọc được");
            });
          }}
          onOpen={(id, loc) => {
            setLocationId(loc);
            openLocation(loc, `/provider?focus=${id}`);
          }}
        />
      ) : null}
      {view === "products" && data ? (
        <Products
          data={data}
          canEdit={chain?.canEditCatalog === true}
          scopeQs={scopeQs}
          onCreated={() => void load()}
        />
      ) : null}
      {view === "product" && data && offeringId ? (
        <ProductDetail
          data={data}
          offeringId={offeringId}
          scopeQs={scopeQs}
          onSaved={(message) => {
            setNotice(message);
            void load();
          }}
        />
      ) : null}
      {view === "today" && data ? <Today data={data} /> : null}
      {view === "campaigns" && chain && sticky ? (
        <CampaignBoard scopeQs={scopeQs} scopes={chain.scopes} />
      ) : null}
      {view === "members" && data ? (
        <Members
          data={data}
          scopes={chain?.scopes ?? []}
          scopeQs={scopeQs}
          onChanged={() => void load()}
        />
      ) : null}
      {!data && !error && view !== "campaigns" ? <p className="tagline">Đang tải…</p> : null}
    </ProviderPageShell>
  );
}

function Overview({ data }: { data: Record<string, unknown> }) {
  const attention = Array.isArray(data.attention) ? data.attention as { locationId: string; name: string; reason: string }[] : [];
  const stats = [
    ["Điểm bán", data.locationCount],
    ["Đang mở", data.openCount],
    ["Đơn hôm nay", data.ordersToday],
    ["Chờ xử lý", data.ordersPending],
    ["Đang giao", data.ordersDelivering],
    ["Đang bán", data.sellingCount],
    ["Hết hàng", data.soldOutCount],
  ];
  return (
    <>
      <div className="chain-stats">
        {stats.map(([label, value]) => (
          <div className="card chain-stat" key={String(label)}>
            <strong>{String(value ?? 0)}</strong>
            <span>{String(label)}</span>
          </div>
        ))}
      </div>
      <h2>Điểm cần chú ý</h2>
      {attention.length === 0 ? <p>Không có điểm nào cần chú ý.</p> : (
        <ul>{attention.map((row) => <li key={row.locationId}>{row.name} — {row.reason}</li>)}</ul>
      )}
    </>
  );
}

function Locations({
  data,
  onOpen,
}: {
  data: Record<string, unknown>;
  onOpen: (id: string) => void;
}) {
  const rows = Array.isArray(data.locations) ? data.locations as Record<string, unknown>[] : [];
  return (
    <div className="chain-table-wrap">
      <table className="chain-table">
        <thead>
          <tr>
            <th>Điểm bán</th><th>City</th><th>Zone</th><th>Trạng thái</th><th>Mở cửa</th><th>Đơn hôm nay</th><th>Đang bán</th><th>Hết hàng</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              <td><button type="button" className="linkish" onClick={() => onOpen(String(row.id))}>{String(row.name)}</button></td>
              <td>{String(row.city ?? "")}</td>
              <td>{Array.isArray(row.zones) ? row.zones.join(", ") : ""}</td>
              <td>{String(row.status)}</td>
              <td>{String(row.liveStatus)}</td>
              <td>{String(row.ordersToday)}</td>
              <td>{String(row.sellingCount)}</td>
              <td>{String(row.soldOutCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LocationDetail({
  data,
  locationId,
  onOpen,
}: {
  data: Record<string, unknown>;
  locationId: string;
  onOpen: (href: string) => void;
}) {
  const rows = Array.isArray(data.locations) ? data.locations as Record<string, unknown>[] : [];
  const row = rows.find((item) => item.id === locationId);
  if (!row) return <p>Không thấy điểm bán trong phạm vi này.</p>;
  const links: Array<[string, string]> = [
    ["/provider/board", "Hôm nay"],
    ["/provider", "Đơn"],
    ["/provider/products", "Sản phẩm"],
    ["/provider/selling", "Cách bán"],
    ["/provider/settings", "Gian hàng"],
  ];
  return (
    <div className="card">
      <h2>{String(row.name)}</h2>
      <p>{String(row.city ?? "")} · {Array.isArray(row.zones) ? row.zones.join(", ") : ""}</p>
      <p>Trạng thái {String(row.status)} · {String(row.liveStatus)}</p>
      <div className="board-row">
        {links.map(([href, label]) => (
          <button key={href} type="button" className="btn" onClick={() => onOpen(href)}>{label}</button>
        ))}
      </div>
    </div>
  );
}

function Orders({
  data,
  onFilter,
  onOpen,
}: {
  data: Record<string, unknown>;
  onFilter: (filter: { range?: string; status?: string; locationId?: string; vertical?: string }) => void;
  onOpen: (orderId: string, locationId: string) => void;
}) {
  const rows = Array.isArray(data.orders) ? data.orders as Record<string, unknown>[] : [];
  return (
    <>
      <form
        className="board-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onFilter({
            range: String(form.get("range") ?? "today"),
            status: String(form.get("status") ?? ""),
            locationId: String(form.get("locationId") ?? ""),
            vertical: String(form.get("vertical") ?? ""),
          });
        }}
      >
        <select name="range" defaultValue="today"><option value="today">Hôm nay</option><option value="7d">7 ngày</option></select>
        <input name="status" placeholder="Trạng thái" />
        <input name="locationId" placeholder="Location id" />
        <input name="vertical" placeholder="Loại dịch vụ" />
        <button className="btn" type="submit">Lọc</button>
      </form>
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr><th>Đơn</th><th>Điểm bán</th><th>Loại</th><th>Khách</th><th>Trạng thái</th><th>Giao</th><th>Lúc</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td><button type="button" className="linkish" onClick={() => onOpen(String(row.id), String(row.locationId))}>{String(row.orderNumber)}</button></td>
                <td>{String(row.locationName)}</td>
                <td>{String(row.vertical)}</td>
                <td>{String(row.customerName)}</td>
                <td>{String(row.status)}</td>
                <td>{String(row.fulfillment)}</td>
                <td>{String(row.createdAt).slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Products({
  data,
  canEdit,
  scopeQs,
  onCreated,
}: {
  data: Record<string, unknown>;
  canEdit: boolean;
  scopeQs: string;
  onCreated: () => void;
}) {
  const rows = Array.isArray(data.products) ? data.products as Record<string, unknown>[] : [];
  return (
    <>
      {canEdit ? (
        <form
          className="card board-row"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void api(`/provider/organization/products?${scopeQs}`, {
              method: "POST",
              body: JSON.stringify({ name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") }),
            }).then(() => {
              event.currentTarget.reset();
              onCreated();
            });
          }}
        >
          <input name="name" placeholder="Tên sản phẩm chung" required />
          <input name="description" placeholder="Mô tả" />
          <button className="btn" type="submit">Tạo</button>
        </form>
      ) : null}
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr><th>Tên</th><th>Nhóm</th><th>Loại</th><th>Đang bán</th><th>Hết hàng</th><th>Trạng thái</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td><Link href={`/provider/organization/products/${String(row.id)}?${scopeQs}`}>{String(row.name)}</Link></td>
                <td>{String(row.categoryName ?? "")}</td>
                <td>{String(row.vertical)}</td>
                <td>{String(row.sellingLocations)}</td>
                <td>{String(row.soldOutLocations)}</td>
                <td>{String(row.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProductDetail({
  data,
  offeringId,
  scopeQs,
  onSaved,
}: {
  data: Record<string, unknown>;
  offeringId: string;
  scopeQs: string;
  onSaved: (message: string) => void;
}) {
  const product = (data.product ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(data.locations) ? data.locations as Record<string, unknown>[] : [];
  const canEdit = data.canEditCatalog === true;
  return (
    <>
      <h2>{String(product.name ?? "")}</h2>
      {canEdit ? (
        <form
          className="card board-row"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void api(`/provider/organization/products/${offeringId}?${scopeQs}`, {
              method: "PATCH",
              body: JSON.stringify({
                name: String(form.get("name") ?? ""),
                description: String(form.get("description") ?? ""),
                imageUrl: String(form.get("imageUrl") ?? ""),
              }),
            }).then(() => onSaved("Đã lưu sản phẩm chung"));
          }}
        >
          <input name="name" defaultValue={String(product.name ?? "")} />
          <input name="description" placeholder="Mô tả" />
          <input name="imageUrl" placeholder="Ảnh URL" />
          <button className="btn" type="submit">Lưu</button>
        </form>
      ) : null}
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr><th>Điểm bán</th><th>Giá</th><th>Tồn hôm nay</th><th>Trạng thái</th><th>Mở bán</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.locationId)}>
                <td>{String(row.locationName)}</td>
                <td>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const price = Number(new FormData(event.currentTarget).get("price"));
                      void api(`/provider/organization/products/${offeringId}/locations/${String(row.locationId)}/price?${scopeQs}`, {
                        method: "POST",
                        body: JSON.stringify({ priceVnd: price }),
                      }).then(() => onSaved("Đã lưu giá"));
                    }}
                  >
                    <input name="price" type="number" defaultValue={row.priceVnd == null ? "" : String(row.priceVnd)} />
                    <button className="btn" type="submit">Giá</button>
                  </form>
                </td>
                <td>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const quantity = Number(new FormData(event.currentTarget).get("qty"));
                      void api(`/provider/organization/products/${offeringId}/locations/${String(row.locationId)}/stock?${scopeQs}`, {
                        method: "POST",
                        body: JSON.stringify({ quantity }),
                      }).then(() => onSaved("Đã lưu tồn"));
                    }}
                  >
                    <input name="qty" type="number" defaultValue={row.availableQty == null ? "" : String(row.availableQty)} />
                    <button className="btn" type="submit">Tồn</button>
                  </form>
                </td>
                <td>{String(row.status ?? "Chưa mở")}</td>
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      void api(`/provider/organization/products/${offeringId}/locations/${String(row.locationId)}/availability?${scopeQs}`, {
                        method: "POST",
                        body: JSON.stringify({ action: row.selling ? "sold_out" : "show" }),
                      }).then(() => onSaved(row.selling ? "Đã đánh hết" : "Đã mở lại"));
                    }}
                  >
                    {row.selling ? "Hết" : "Mở"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Today({ data }: { data: Record<string, unknown> }) {
  const rows = Array.isArray(data.rows) ? data.rows as Record<string, unknown>[] : [];
  return (
    <>
      <p>Bài trang chủ vẫn chờ Zone duyệt. Chuỗi không duyệt thay Zone.</p>
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr><th>Điểm bán</th><th>Món</th><th>Tồn</th><th>Trạng thái</th><th>Bài Zone</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${String(row.locationId)}-${String(row.offeringId)}`}>
                <td>{String(row.locationName)}</td>
                <td>{String(row.offeringName)}</td>
                <td>{row.availableQty == null ? "không giới hạn" : String(row.availableQty)}</td>
                <td>{String(row.status)}</td>
                <td>{String(row.hero)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Members({
  data,
  scopes,
  scopeQs,
  onChanged,
}: {
  data: Record<string, unknown>;
  scopes: Scope[];
  scopeQs: string;
  onChanged: () => void;
}) {
  const rows = Array.isArray(data.members) ? data.members as Record<string, unknown>[] : [];
  return (
    <>
      <form
        className="card board-row"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const [memberScopeType, memberScopeId] = String(form.get("scope") ?? "").split(":");
          void api(`/provider/organization/members?${scopeQs}`, {
            method: "POST",
            body: JSON.stringify({
              phone: String(form.get("phone") ?? ""),
              role: String(form.get("role") ?? "STAFF"),
              scopeType: memberScopeType,
              scopeId: memberScopeId,
            }),
          }).then(() => onChanged());
        }}
      >
        <input name="phone" placeholder="Số điện thoại" required />
        <select name="role">
          <option value="STAFF">STAFF</option>
          <option value="MANAGER">MANAGER</option>
          <option value="OWNER">OWNER</option>
        </select>
        <select name="scope">
          {scopes.map((scope) => (
            <option key={`${scope.scopeType}:${scope.scopeId}`} value={`${scope.scopeType}:${scope.scopeId}`}>{scope.label}</option>
          ))}
        </select>
        <button className="btn" type="submit">Gán</button>
      </form>
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead><tr><th>Tên</th><th>SĐT</th><th>Role</th><th>Scope</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>{String(row.displayName)}</td>
                <td>{String(row.phone ?? "")}</td>
                <td>{String(row.role)}</td>
                <td>{String(row.scopeType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
