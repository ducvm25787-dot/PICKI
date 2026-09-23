"use client";

import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { loyaltyLabelVi } from "../../../../lib/loyalty";

type Benefit = {
  id: string;
  tier: string;
  benefitType: string;
  title: string;
  description: string | null;
  discountPercent: number | null;
  customText: string | null;
  active: boolean;
};

type LoyaltyResponse = {
  program: {
    enabled: boolean;
    regularThreshold: number;
    vipThreshold: number;
  };
  benefits: Benefit[];
};

const BENEFIT_TYPES = [
  { value: "DISCOUNT_PERCENT", label: "% giảm" },
  { value: "FREE_ITEM", label: "Tặng món" },
  { value: "FREE_DELIVERY", label: "Free ship" },
  { value: "PRIORITY_SLOT", label: "Ưu tiên slot" },
  { value: "EARLY_ACCESS", label: "Mở sớm" },
  { value: "CUSTOM_TEXT", label: "Tuỳ chỉnh" },
] as const;

export default function ProviderLoyaltyPage() {
  const { locationId } = useProviderLocation();
  const [data, setData] = useState<LoyaltyResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [regularThreshold, setRegularThreshold] = useState(5);
  const [vipThreshold, setVipThreshold] = useState(15);
  const [tier, setTier] = useState<"REGULAR" | "VIP">("REGULAR");
  const [benefitType, setBenefitType] = useState<string>("CUSTOM_TEXT");
  const [benefitTitle, setBenefitTitle] = useState("");
  const [discountPercent, setDiscountPercent] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<LoyaltyResponse>(`/provider/locations/${locationId}/loyalty`);
    setData(res);
    setEnabled(res.program.enabled);
    setRegularThreshold(res.program.regularThreshold);
    setVipThreshold(res.program.vipThreshold);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải được");
    });
  }, [load]);

  async function saveProgram() {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    setToast(null);
    try {
      const res = await api<LoyaltyResponse>(`/provider/locations/${locationId}/loyalty`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled,
          regularThreshold,
          vipThreshold,
        }),
      });
      setData(res);
      setToast(enabled ? "Đã bật nhãn Quen / VIP trên đơn" : "Đã tắt chương trình");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  async function addBenefit() {
    if (!locationId || !benefitTitle.trim()) {
      setError("Nhập tên quyền lợi");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/provider/locations/${locationId}/loyalty/benefits`, {
        method: "POST",
        body: JSON.stringify({
          tier,
          benefitType,
          title: benefitTitle.trim(),
          discountPercent: benefitType === "DISCOUNT_PERCENT" ? discountPercent : undefined,
        }),
      });
      setBenefitTitle("");
      setToast("Đã thêm quyền lợi (lean — chưa auto áp dụng thanh toán V1)");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Khách quen">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Nhãn trên đơn</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Không coin / điểm. Dựa trên số lần hoàn thành đơn với quán này.
        </p>
        <label className="field" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Bật chương trình Quen / VIP</span>
        </label>
        <label className="field">
          <span>Ngưỡng {loyaltyLabelVi("REGULAR")} (≥ lần)</span>
          <input
            type="number"
            min={1}
            max={100}
            value={regularThreshold}
            onChange={(e) => setRegularThreshold(Number(e.target.value) || 5)}
          />
        </label>
        <label className="field">
          <span>Ngưỡng {loyaltyLabelVi("VIP")} (≥ lần)</span>
          <input
            type="number"
            min={2}
            max={500}
            value={vipThreshold}
            onChange={(e) => setVipThreshold(Number(e.target.value) || 15)}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {toast ? <p className="stat">{toast}</p> : null}
        <button type="button" className="btn" disabled={busy} onClick={() => void saveProgram()}>
          Lưu chương trình
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Quyền lợi (tuỳ chọn)</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Ghi nhận quyền lợi để staff nhớ — V1 chưa trừ tiền tự động.
        </p>
        <label className="field">
          <span>Hạng</span>
          <select value={tier} onChange={(e) => setTier(e.target.value as "REGULAR" | "VIP")}>
            <option value="REGULAR">{loyaltyLabelVi("REGULAR")}</option>
            <option value="VIP">{loyaltyLabelVi("VIP")}</option>
          </select>
        </label>
        <label className="field">
          <span>Loại</span>
          <select value={benefitType} onChange={(e) => setBenefitType(e.target.value)}>
            {BENEFIT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {benefitType === "DISCOUNT_PERCENT" ? (
          <label className="field">
            <span>% giảm</span>
            <input
              type="number"
              min={1}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value) || 10)}
            />
          </label>
        ) : null}
        <label className="field">
          <span>Tên quyền lợi</span>
          <input
            value={benefitTitle}
            onChange={(e) => setBenefitTitle(e.target.value)}
            maxLength={80}
            placeholder="VD: Giảm 10% món chính"
          />
        </label>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void addBenefit()}
        >
          Thêm quyền lợi
        </button>
      </div>

      <div className="card">
        <p className="section-title">Danh sách quyền lợi</p>
        {!data?.benefits.length ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa có.
          </p>
        ) : (
          <ul className="familiar-list">
            {data.benefits.map((b) => (
              <li key={b.id} className="familiar-row">
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>{b.title}</p>
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {loyaltyLabelVi(b.tier)} · {b.benefitType}
                    {b.discountPercent != null ? ` · ${String(b.discountPercent)}%` : ""}
                    {!b.active ? " · tắt" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProviderPageShell>
  );
}
