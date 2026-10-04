"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { ChainScopeChoice } from "./provider-location-context";

type CampaignRow = {
  id: string;
  name: string;
  campaignType: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus: string;
  targets: { targetType: string; targetId: string }[];
};

const TYPES = [
  ["HERO_PRODUCT", "Sản phẩm nổi bật"],
  ["TODAY_FEATURE", "Hôm nay"],
  ["PRICE_PROMOTION", "Giá khuyến mại"],
  ["DELIVERY_SUBSIDY", "Hỗ trợ giao hàng"],
  ["CONTENT_CAMPAIGN", "Nội dung"],
] as const;

export function CampaignBoard({ scopes, scopeQs }: { scopes: ChainScopeChoice[]; scopeQs: string }) {
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [campaignType, setCampaignType] = useState<(typeof TYPES)[number][0]>("PRICE_PROMOTION");
  const [offeringId, setOfferingId] = useState("");
  const [target, setTarget] = useState(scopes[0] ? `${scopes[0].scopeType}:${scopes[0].scopeId}` : "");
  const [discountPercent, setDiscountPercent] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  async function reload(nextStatus = status) {
    const filter = nextStatus ? `&status=${encodeURIComponent(nextStatus)}` : "";
    const data = await api<{ campaigns: CampaignRow[] }>(`/provider/organization/campaigns?${scopeQs}${filter}`);
    setRows(data.campaigns);
  }

  useEffect(() => {
    void reload().catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
    void api<{ products: { id: string; name: string }[] }>(`/provider/organization/products?${scopeQs}`)
      .then((data) => setProducts(data.products))
      .catch(() => setProducts([]));
  }, [scopeQs, status]);

  return (
    <div className="stack">
      {error ? <p className="card">{error}</p> : null}
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const [targetType, targetId] = target.split(":");
          const start = new Date(startsAt);
          const end = new Date(endsAt);
          void api(`/provider/organization/campaigns?${scopeQs}`, {
            method: "POST",
            body: JSON.stringify({
              name,
              campaignType,
              startsAt: start.toISOString(),
              endsAt: end.toISOString(),
              targets: [{ targetType, targetId }],
              items: [{
                offeringId: offeringId || null,
                discountPercent: discountPercent ? Number(discountPercent) : null,
              }],
              submit: true,
            }),
          })
            .then(() => reload())
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không gửi được"));
        }}
      >
        <h2>Gửi chương trình</h2>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tên chương trình" required />
        <select value={campaignType} onChange={(event) => setCampaignType(event.target.value as (typeof TYPES)[number][0])}>
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={offeringId} onChange={(event) => setOfferingId(event.target.value)} required>
          <option value="">Chọn sản phẩm</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        <select value={target} onChange={(event) => setTarget(event.target.value)}>
          {scopes.map((scope) => (
            <option key={`${scope.scopeType}:${scope.scopeId}`} value={`${scope.scopeType}:${scope.scopeId}`}>{scope.label}</option>
          ))}
        </select>
        <input value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} placeholder="% giảm, nếu có" inputMode="numeric" />
        <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required />
        <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required />
        <p>Xem trước: {name || "Chương trình"} · {TYPES.find((item) => item[0] === campaignType)?.[1]} · gửi Pickee duyệt một lần.</p>
        <button type="submit">Gửi duyệt</button>
      </form>
      <label>
        Trạng thái
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Tất cả</option>
          {["DRAFT", "SUBMITTED", "APPROVED", "ACTIVE", "PAUSED", "ENDED", "REJECTED"].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
      </label>
      <div className="chain-table-wrap">
        <table className="chain-table">
          <thead>
            <tr>
              <th>Tên</th><th>Loại</th><th>Phạm vi</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th>Duyệt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td>{row.campaignType}</td>
                <td>{row.targets.map((item) => item.targetType).join(", ")}</td>
                <td>{new Date(row.startsAt).toLocaleString("vi-VN")}</td>
                <td>{new Date(row.endsAt).toLocaleString("vi-VN")}</td>
                <td>{row.status}</td>
                <td>{row.approvalStatus}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
