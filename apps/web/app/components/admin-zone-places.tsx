"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatVnd } from "../../lib/money";

type PlaceKind =
  | "BUILDING"
  | "AREA"
  | "TRADITIONAL_MARKET"
  | "RESIDENTIAL_PODIUM_CLUSTER"
  | "GROUND_STREET_CLUSTER";

const KIND_LABEL: Record<PlaceKind, string> = {
  BUILDING: "Tòa nhà",
  AREA: "Khu vực",
  TRADITIONAL_MARKET: "Chợ truyền thống",
  RESIDENTIAL_PODIUM_CLUSTER: "Cụm kiosk / chợ hiện đại",
  GROUND_STREET_CLUSTER: "Cụm cửa hàng mặt đất",
};

type ZonePlace = {
  id: string;
  kind: PlaceKind;
  code: string;
  displayName: string;
  elevatorNote: string | null;
  accessCardRequired: boolean;
  securityNote: string | null;
  callUpRequired: boolean;
  doorDeliveryAllowed: boolean;
  lobbyWaitMinutes: number;
  doorWaitMinutes: number;
  runnerFeePerMinuteVnd: number;
  doorSurcharge: number;
  slowElevatorSurcharge: number;
  elevatorWaitMinutes: number;
  anchorCode: string | null;
  notes: string | null;
};

type ShopPin = {
  locationId: string;
  brandName: string;
  displayName: string;
  zonePlaceId: string | null;
};

type Draft = {
  id?: string;
  kind: PlaceKind;
  code: string;
  displayName: string;
  elevatorNote: string;
  accessCardRequired: boolean;
  securityNote: string;
  callUpRequired: boolean;
  doorDeliveryAllowed: boolean;
  lobbyWaitMinutes: string;
  doorWaitMinutes: string;
  runnerFeePerMinuteVnd: string;
  doorSurcharge: string;
  slowElevatorSurcharge: string;
  elevatorWaitMinutes: string;
  anchorCode: string;
  notes: string;
};

function blankDraft(): Draft {
  return {
    kind: "BUILDING",
    code: "",
    displayName: "",
    elevatorNote: "",
    accessCardRequired: false,
    securityNote: "",
    callUpRequired: false,
    doorDeliveryAllowed: true,
    lobbyWaitMinutes: "0",
    doorWaitMinutes: "0",
    runnerFeePerMinuteVnd: "0",
    doorSurcharge: "0",
    slowElevatorSurcharge: "0",
    elevatorWaitMinutes: "0",
    anchorCode: "",
    notes: "",
  };
}

function fromPlace(place: ZonePlace): Draft {
  return {
    id: place.id,
    kind: place.kind,
    code: place.code,
    displayName: place.displayName,
    elevatorNote: place.elevatorNote ?? "",
    accessCardRequired: place.accessCardRequired,
    securityNote: place.securityNote ?? "",
    callUpRequired: place.callUpRequired,
    doorDeliveryAllowed: place.doorDeliveryAllowed,
    lobbyWaitMinutes: String(place.lobbyWaitMinutes),
    doorWaitMinutes: String(place.doorWaitMinutes),
    runnerFeePerMinuteVnd: String(place.runnerFeePerMinuteVnd),
    doorSurcharge: String(place.doorSurcharge ?? 0),
    slowElevatorSurcharge: String(place.slowElevatorSurcharge ?? 0),
    elevatorWaitMinutes: String(place.elevatorWaitMinutes ?? 0),
    anchorCode: place.anchorCode ?? "",
    notes: place.notes ?? "",
  };
}

function feePreview(minutesRaw: string, rateRaw: string): number {
  const minutes = Number(minutesRaw);
  const rate = Number(rateRaw);
  if (!Number.isInteger(minutes) || !Number.isInteger(rate) || minutes < 0 || rate < 0) return 0;
  return minutes * rate;
}

export function AdminZonePlaces({ zoneId }: { zoneId: string }) {
  const [places, setPlaces] = useState<ZonePlace[]>([]);
  const [shops, setShops] = useState<ShopPin[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [res, shopRes] = await Promise.all([
      api<{ places: ZonePlace[] }>(`/admin/zones/${zoneId}/places`),
      api<{ shops: ShopPin[] }>(`/admin/zones/${zoneId}/shops`),
    ]);
    setPlaces(res.places);
    setShops(shopRes.shops);
  }, [zoneId]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setErr(e instanceof Error ? e.message : "Không tải được tòa / khu");
    });
  }, [load]);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      await api(`/admin/zones/${zoneId}/places`, {
        method: "POST",
        body: JSON.stringify({
          id: draft.id,
          kind: draft.kind,
          code: draft.code,
          displayName: draft.displayName,
          elevatorNote: draft.elevatorNote || null,
          accessCardRequired: draft.accessCardRequired,
          securityNote: draft.securityNote || null,
          callUpRequired: draft.callUpRequired,
          doorDeliveryAllowed: draft.doorDeliveryAllowed,
          lobbyWaitMinutes: Number(draft.lobbyWaitMinutes),
          doorWaitMinutes: Number(draft.doorWaitMinutes),
          runnerFeePerMinuteVnd: Number(draft.runnerFeePerMinuteVnd),
          doorSurcharge: Number(draft.doorSurcharge),
          slowElevatorSurcharge: Number(draft.slowElevatorSurcharge),
          elevatorWaitMinutes: Number(draft.elevatorWaitMinutes),
          anchorCode: draft.anchorCode || null,
          notes: draft.notes || null,
        }),
      });
      setMsg("Đã lưu. Đơn mới sẽ dùng thông tin này.");
      setDraft(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  async function archive(place: ZonePlace) {
    if (!window.confirm(`Ẩn ${place.displayName}? Đơn cũ giữ nguyên ghi chú đã chụp.`)) return;
    setErr(null);
    try {
      await api(`/admin/zones/${zoneId}/places/${place.id}/archive`, { method: "POST" });
      if (draft?.id === place.id) setDraft(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không ẩn được");
    }
  }

  const lobbyFee = draft ? feePreview(draft.lobbyWaitMinutes, draft.runnerFeePerMinuteVnd) : 0;
  const doorFee = draft ? feePreview(draft.doorWaitMinutes, draft.runnerFeePerMinuteVnd) : 0;

  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%" }}>
      <p className="stat" style={{ marginTop: 0 }}>
        Tòa, chợ, cụm kiosk và cụm mặt đất. Phụ phí cửa, thang chậm và phút chờ cộng vào tiền runner của chuyến đã phân loại. Runner vẫn tìm khách bằng pin, địa chỉ và cuộc gọi.
      </p>
      {msg ? <p className="admin-workspace-msg ok">{msg}</p> : null}
      {err ? <p className="admin-workspace-msg err">{err}</p> : null}

      <button type="button" className="btn" onClick={() => setDraft(blankDraft())}>
        Thêm tòa / khu
      </button>

      <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
        {places.map((place) => {
          const rate = place.runnerFeePerMinuteVnd;
          return (
            <article key={place.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <div>
                  <strong>
                    {place.displayName} · {KIND_LABEL[place.kind] ?? place.kind}
                  </strong>
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {place.doorDeliveryAllowed ? "Được lên căn" : "Chỉ sảnh"}
                    {place.accessCardRequired ? " · Cần thẻ" : ""}
                    {place.callUpRequired ? " · Gọi lên căn" : ""}
                    {` · Sảnh ${String(place.lobbyWaitMinutes)} phút (${formatVnd(place.lobbyWaitMinutes * rate)})`}
                    {place.doorDeliveryAllowed
                      ? ` · Lên căn ${String(place.doorWaitMinutes)} phút (${formatVnd(place.doorWaitMinutes * rate)})`
                      : ""}
                    {` · Cửa ${formatVnd(place.doorSurcharge ?? 0)} · Thang chậm ${formatVnd(place.slowElevatorSurcharge ?? 0)}`}
                    {place.notes ? ` · ${place.notes}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setDraft(fromPlace(place))}>
                    Sửa
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => void archive(place)}>
                    Ẩn
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <h2 style={{ marginTop: 24 }}>Điểm bán</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {shops.map((shop) => (
          <label key={shop.locationId} className="field">
            {shop.brandName} · {shop.displayName}
            <select
              value={shop.zonePlaceId ?? ""}
              onChange={(event) => {
                const zonePlaceId = event.target.value || null;
                setShops((current) =>
                  current.map((row) => (row.locationId === shop.locationId ? { ...row, zonePlaceId } : row)),
                );
                void api(`/admin/zones/${zoneId}/locations/${shop.locationId}/place`, {
                  method: "PATCH",
                  body: JSON.stringify({ zonePlaceId }),
                }).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Không gắn được điểm bán"));
              }}
            >
              <option value="">Chưa gắn</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.code} · {place.displayName}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {draft ? (
        <form
          className="card"
          style={{ marginTop: 16, padding: 16, display: "grid", gap: 12 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <p className="section-title" style={{ margin: 0 }}>
            {draft.id ? `Sửa ${draft.code}` : "Tòa hoặc khu mới"}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="field">
              Loại
              <select value={draft.kind} onChange={(e) => patch({ kind: e.target.value as PlaceKind })}>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Mã (trùng ô Tòa trên địa chỉ)
              <input value={draft.code} onChange={(e) => patch({ code: e.target.value })} placeholder="CT12A" />
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              Tên
              <input
                value={draft.displayName}
                onChange={(e) => patch({ displayName: e.target.value })}
                placeholder="Chung cư CT12A"
              />
            </label>
          </div>
          <label className="field">
            Thang máy
            <input
              value={draft.elevatorNote}
              onChange={(e) => patch({ elevatorNote: e.target.value })}
              placeholder="Thẻ từ sảnh, hoặc thang dịch vụ"
            />
          </label>
          <label className="field" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.accessCardRequired}
              onChange={(e) => patch({ accessCardRequired: e.target.checked })}
            />
            Cần thẻ để lên
          </label>
          <label className="field">
            Bảo vệ
            <input
              value={draft.securityNote}
              onChange={(e) => patch({ securityNote: e.target.value })}
              placeholder="Bảo vệ trực sảnh, kiểm tra đơn"
            />
          </label>
          <label className="field" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.callUpRequired}
              onChange={(e) => patch({ callUpRequired: e.target.checked })}
            />
            Bảo vệ phải gọi lên căn trước khi lên
          </label>
          <label className="field" style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={draft.doorDeliveryAllowed}
              onChange={(e) => patch({ doorDeliveryAllowed: e.target.checked })}
            />
            Cho giao lên căn hộ. Bỏ chọn thì chỉ nhận tại sảnh.
          </label>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label className="field">
              Chờ tại sảnh (phút)
              <input
                inputMode="numeric"
                value={draft.lobbyWaitMinutes}
                onChange={(e) => patch({ lobbyWaitMinutes: e.target.value })}
              />
            </label>
            <label className="field">
              Chờ khi lên căn (phút)
              <input
                inputMode="numeric"
                value={draft.doorWaitMinutes}
                onChange={(e) => patch({ doorWaitMinutes: e.target.value })}
                disabled={!draft.doorDeliveryAllowed}
              />
            </label>
            <label className="field">
              Chờ thang (phút)
              <input
                inputMode="numeric"
                value={draft.elevatorWaitMinutes}
                onChange={(e) => patch({ elevatorWaitMinutes: e.target.value })}
              />
            </label>
            <label className="field">
              Phụ phí cửa (VND)
              <input
                inputMode="numeric"
                value={draft.doorSurcharge}
                onChange={(e) => patch({ doorSurcharge: e.target.value })}
              />
            </label>
            <label className="field">
              Phụ phí thang chậm (VND)
              <input
                inputMode="numeric"
                value={draft.slowElevatorSurcharge}
                onChange={(e) => patch({ slowElevatorSurcharge: e.target.value })}
              />
            </label>
            <label className="field">
              Đơn giá mỗi phút (VND)
              <input
                inputMode="numeric"
                value={draft.runnerFeePerMinuteVnd}
                onChange={(e) => patch({ runnerFeePerMinuteVnd: e.target.value })}
              />
            </label>
          </div>
          <p className="stat" style={{ margin: 0 }}>
            Sảnh: {formatVnd(lobbyFee)}
            {draft.doorDeliveryAllowed ? ` · Lên căn: ${formatVnd(doorFee)}` : " · Không lên căn"}
          </p>
          <label className="field">
            Mã tòa neo (kiosk chân tòa dùng mã tòa để tính cùng tòa)
            <input value={draft.anchorCode} onChange={(e) => patch({ anchorCode: e.target.value })} placeholder="CT12A" />
          </label>
          <label className="field">
            Ghi chú giao hàng
            <input value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn" disabled={saving}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(null)}>
              Đóng
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
