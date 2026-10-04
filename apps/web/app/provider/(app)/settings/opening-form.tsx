"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../../../lib/api";

const KINDS = [
  { id: "GIFT", label: "Tặng món" },
  { id: "DISCOUNT", label: "Giảm giá" },
  { id: "NEW_ITEM", label: "Món mới" },
  { id: "HAPPY_HOUR", label: "Giờ vàng" },
  { id: "FAMILIAR", label: "Khách quen" },
  { id: "FLASH", label: "Flash" },
] as const;

type Promotion = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  startsAt: string;
  endsAt: string;
  spotlight: boolean;
};

export function ProviderOpeningForm({ locationId }: { locationId: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("GIFT");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [spotlight, setSpotlight] = useState(false);
  const [promos, setPromos] = useState<Promotion[]>([]);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await api<{ promotions: Promotion[] }>(
      `/provider/locations/${locationId}/promotions`,
    );
    setPromos(list.promotions ?? []);
  }, [locationId]);

  useEffect(() => {
    void load().catch(() => setNote("Chưa tải được khuyến mại"));
  }, [load]);

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-title">Khuyến mại</p>
      <p className="stat">
        Chỉ tạo chương trình khuyến mại. Hết hạn thì ẩn. Spotlight có nhãn Tài trợ, không tính vào
        Chỗ quen. Tin khai trương do admin đăng.
      </p>

      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="promoKind">Loại khuyến mại</label>
        <select id="promoKind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="promoTitle">Tiêu đề</label>
        <input id="promoTitle" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="promoDetail">Chi tiết</label>
        <input id="promoDetail" value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="promoStart">Bắt đầu</label>
        <input id="promoStart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="promoEnd">Kết thúc</label>
        <input id="promoEnd" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </div>
      <label className="stat" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={spotlight} onChange={(e) => setSpotlight(e.target.checked)} />
        Spotlight (nhãn Tài trợ trên Home)
      </label>
      <button
        type="button"
        className="btn"
        style={{ marginTop: 12 }}
        disabled={title.trim().length < 2 || !startsAt || !endsAt}
        onClick={() => {
          void api(`/provider/locations/${locationId}/promotions`, {
            method: "POST",
            body: JSON.stringify({
              kind,
              title: title.trim(),
              detail: detail.trim() || undefined,
              startsAt: new Date(startsAt).toISOString(),
              endsAt: new Date(endsAt).toISOString(),
              spotlight,
            }),
          }).then(() => {
            setTitle("");
            setDetail("");
            setNote("Đã tạo khuyến mại");
            return load();
          });
        }}
      >
        Tạo khuyến mại
      </button>
      {note ? <p className="stat">{note}</p> : null}
      {promos.map((p) => (
        <p key={p.id} className="stat" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            {p.title}
            {p.spotlight ? " · Tài trợ" : ""}
          </span>
          <button
            type="button"
            className="order-phone-link"
            style={{ background: "none", border: "none", cursor: "pointer" }}
            onClick={() => {
              void api(`/provider/locations/${locationId}/promotions/${p.id}`, {
                method: "DELETE",
              }).then(() => load());
            }}
          >
            Xóa
          </button>
        </p>
      ))}
    </div>
  );
}
