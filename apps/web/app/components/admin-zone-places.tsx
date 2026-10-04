"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { formatVnd } from "../../lib/money";

type PlaceKind = "BUILDING" | "AREA";

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
  notes: string | null;
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ places: ZonePlace[] }>(`/admin/zones/${zoneId}/places`);
    setPlaces(res.places);
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
        Thang máy, thẻ, bảo vệ và gọi lên căn quyết định giao lên căn hay chỉ sảnh. Phí runner thêm =
        phút chờ × đơn giá. Khách không trả khoản này. Opening Week vẫn chỉ bao phí giao gốc.
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
                    {place.code} · {place.kind === "BUILDING" ? "Tòa" : "Khu"}
                  </strong>
                  <p className="stat" style={{ margin: "4px 0 0" }}>
                    {place.doorDeliveryAllowed ? "Được lên căn" : "Chỉ sảnh"}
                    {place.accessCardRequired ? " · Cần thẻ" : ""}
                    {place.callUpRequired ? " · Gọi lên căn" : ""}
                    {` · Sảnh ${String(place.lobbyWaitMinutes)} phút (${formatVnd(place.lobbyWaitMinutes * rate)})`}
                    {place.doorDeliveryAllowed
                      ? ` · Lên căn ${String(place.doorWaitMinutes)} phút (${formatVnd(place.doorWaitMinutes * rate)})`
                      : ""}
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
                <option value="BUILDING">Tòa nhà</option>
                <option value="AREA">Khu vực</option>
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
            Ghi chú thêm
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
