"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AdminZoneMapEditor,
  type AdminLatLng,
} from "../../../../components/admin-zone-map";
import { AdminPageShell } from "../../../../components/admin-session-context";
import { api } from "../../../../../lib/api";

type TabId = "boundary" | "core" | "extended" | "anchor" | "shops";

type ZoneGeo = {
  zone: {
    id: string;
    slug: string;
    displayName: string;
    status: string;
    anchor: AdminLatLng;
  };
  boundary: {
    ring: AdminLatLng[];
    version: number | null;
    changeReason: string | null;
  };
  serviceAreas: {
    CORE: { ring: AdminLatLng[] };
    PRIMARY: { ring: AdminLatLng[] };
    EXTENDED: { ring: AdminLatLng[] };
  };
  locations: {
    locationId: string;
    brandName: string;
    displayName: string;
    addressLine: string | null;
    lat: number | null;
    lng: number | null;
    pinVerifiedAt: string | null;
    pinNote: string | null;
    needsPin: boolean;
    verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
    verificationNote: string | null;
    hasVerifiedQr: boolean;
  }[];
};

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "boundary", label: "Ranh giới Zone", hint: "Membership polygon" },
  { id: "core", label: "Vùng trung tâm", hint: "Demand Core" },
  { id: "extended", label: "Vùng giao thoa", hint: "EXTENDED service" },
  { id: "anchor", label: "Neo GPS", hint: "Fallback center" },
  { id: "shops", label: "Vị trí shop", hint: "Pin thủ công" },
];

export default function AdminZoneSetupPage() {
  const params = useParams<{ zoneId: string }>();
  const zoneId = params.zoneId;

  const [data, setData] = useState<ZoneGeo | null>(null);
  const [tab, setTab] = useState<TabId>("boundary");
  const [ring, setRing] = useState<AdminLatLng[]>([]);
  const [anchor, setAnchor] = useState<AdminLatLng | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [shopPin, setShopPin] = useState<AdminLatLng | null>(null);
  const [shopNote, setShopNote] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<
    "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"
  >("UNVERIFIED");
  const [verificationNote, setVerificationNote] = useState("");
  const [qrPath, setQrPath] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<ZoneGeo>(`/admin/zones/${zoneId}/geo`);
    setData(res);
    setAnchor(res.zone.anchor);
    if (tab === "boundary") setRing(res.boundary.ring);
    else if (tab === "core") setRing(res.serviceAreas.CORE.ring);
    else if (tab === "extended") {
      setRing(
        res.serviceAreas.EXTENDED.ring.length > 0
          ? res.serviceAreas.EXTENDED.ring
          : res.boundary.ring,
      );
    }
  }, [zoneId, tab]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setErr(e instanceof Error ? e.message : "Không tải được Zone");
    });
  }, [load]);

  useEffect(() => {
    if (!data) return;
    setMsg(null);
    setErr(null);
    if (tab === "boundary") setRing(data.boundary.ring);
    else if (tab === "core") setRing(data.serviceAreas.CORE.ring);
    else if (tab === "extended") {
      setRing(
        data.serviceAreas.EXTENDED.ring.length > 0
          ? data.serviceAreas.EXTENDED.ring
          : data.boundary.ring,
      );
    }
  }, [tab, data]);

  const overlays = useMemo(() => {
    if (!data) return [];
    const list: { id: string; ring: AdminLatLng[]; color: string; label: string }[] = [];
    if (tab !== "boundary" && data.boundary.ring.length >= 3) {
      list.push({
        id: "membership",
        ring: data.boundary.ring,
        color: "#57534e",
        label: "Ranh giới Zone",
      });
    }
    if (tab !== "core" && data.serviceAreas.CORE.ring.length >= 3) {
      list.push({
        id: "core",
        ring: data.serviceAreas.CORE.ring,
        color: "#16a34a",
        label: "Vùng trung tâm",
      });
    }
    if (tab !== "extended" && data.serviceAreas.EXTENDED.ring.length >= 3) {
      list.push({
        id: "ext",
        ring: data.serviceAreas.EXTENDED.ring,
        color: "#2563eb",
        label: "Vùng giao thoa",
      });
    }
    return list;
  }, [data, tab]);

  const center = anchor ?? data?.zone.anchor ?? { lat: 20.9883, lng: 105.8414 };
  const activeTab = TABS.find((t) => t.id === tab);

  async function publishBoundary() {
    if (ring.length < 3) {
      setErr("Cần ít nhất 3 đỉnh");
      return;
    }
    if (reason.trim().length < 3) {
      setErr("Ghi lý do chỉnh sửa (≥ 3 ký tự) — bắt buộc khi publish");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await api<{ version: number }>(`/admin/zones/${zoneId}/boundary`, {
        method: "POST",
        body: JSON.stringify({ ring, changeReason: reason.trim() }),
      });
      setMsg(`Đã publish ranh giới v${String(res.version)}`);
      setReason("");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Publish thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function saveServiceArea(kind: "CORE" | "EXTENDED") {
    if (ring.length < 3) {
      setErr("Cần ít nhất 3 đỉnh");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/zones/${zoneId}/service-areas`, {
        method: "POST",
        body: JSON.stringify({ kind, ring }),
      });
      setMsg(
        kind === "CORE"
          ? "Đã lưu vùng trung tâm (CORE)"
          : "Đã lưu vùng giao thoa (EXTENDED)",
      );
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lưu thất bại");
    } finally {
      setSaving(false);
    }
  }

  async function saveAnchor() {
    if (!anchor) return;
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/zones/${zoneId}/anchor`, {
        method: "PATCH",
        body: JSON.stringify(anchor),
      });
      setMsg(`Đã cập nhật neo GPS: ${anchor.lat.toFixed(5)}, ${anchor.lng.toFixed(5)}`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lưu neo thất bại");
    } finally {
      setSaving(false);
    }
  }

  function selectShop(locationId: string) {
    const loc = data?.locations.find((l) => l.locationId === locationId);
    if (!loc) return;
    setSelectedShop(locationId);
    setShopPin(
      loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : { ...center },
    );
    setShopNote(loc.pinNote ?? "");
    setShopAddress(loc.addressLine ?? "");
    setVerificationStatus(loc.verificationStatus ?? "UNVERIFIED");
    setVerificationNote(loc.verificationNote ?? "");
    setQrPath(null);
  }

  async function saveVerification() {
    if (!selectedShop) return;
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/locations/${selectedShop}/verification`, {
        method: "PATCH",
        body: JSON.stringify({
          status: verificationStatus,
          note: verificationNote || undefined,
        }),
      });
      if (verificationStatus !== "VERIFIED") setQrPath(null);
      setMsg("Đã lưu xác minh cơ sở");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Không lưu được xác minh");
    } finally {
      setSaving(false);
    }
  }

  async function issueQr() {
    if (!selectedShop) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await api<{ path: string; reissued: boolean }>(
        `/admin/locations/${selectedShop}/verified-qr`,
        { method: "POST", body: JSON.stringify({ reason: verificationNote || undefined }) },
      );
      setQrPath(res.path);
      setMsg(res.reissued ? "Đã đổi QR. Mã in cũ hết hiệu lực." : "Đã cấp QR.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Không cấp được QR");
    } finally {
      setSaving(false);
    }
  }

  async function confirmShopPin() {
    if (!selectedShop || !shopPin) return;
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/locations/${selectedShop}/pin`, {
        method: "PATCH",
        body: JSON.stringify({
          lat: shopPin.lat,
          lng: shopPin.lng,
          addressLine: shopAddress || undefined,
          note: shopNote || undefined,
          verified: true,
        }),
      });
      setMsg("Đã xác nhận vị trí shop");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Xác nhận thất bại");
    } finally {
      setSaving(false);
    }
  }

  if (!data && !err) {
    return (
      <AdminPageShell title="Zone Setup" variant="workspace">
        <p className="stat" style={{ padding: 24 }}>
          Đang tải bản đồ Zone…
        </p>
      </AdminPageShell>
    );
  }

  if (!data) {
    return (
      <AdminPageShell title="Zone Setup" variant="workspace">
        <div style={{ padding: 24 }}>
          <p style={{ color: "#b91c1c" }}>{err}</p>
          <Link href="/admin/zones">← Zones</Link>
        </div>
      </AdminPageShell>
    );
  }

  const mapEditMode = tab === "boundary" || tab === "core" || tab === "extended";
  const mapRing =
    tab === "anchor" || tab === "shops" ? data.boundary.ring : ring;
  const mapPin =
    tab === "shops" ? shopPin : anchor;
  const mapPinChange =
    tab === "shops" ? setShopPin : setAnchor;
  const mapPinLabel = tab === "shops" ? "Shop" : tab === "anchor" ? "Neo GPS" : "Neo";

  return (
    <AdminPageShell title={data.zone.displayName} variant="workspace">
      <aside className="admin-workspace-sidebar">
        <Link href="/admin/zones" className="admin-workspace-back">
          ← Zones
        </Link>
        <p className="stat" style={{ margin: "0 0 12px" }}>
          {data.zone.slug} · {data.zone.status}
          {data.boundary.version != null ? ` · v${String(data.boundary.version)}` : ""}
        </p>

        <nav className="admin-workspace-tabs" aria-label="Zone setup">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`admin-workspace-tab ${tab === t.id ? "is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="admin-workspace-tab-label">{t.label}</span>
              <span className="admin-workspace-tab-hint">{t.hint}</span>
            </button>
          ))}
        </nav>

        <div className="admin-workspace-panel">
          <h2 className="admin-workspace-panel-title">{activeTab?.label}</h2>
          <p className="stat" style={{ marginBottom: 12 }}>
            {mapEditMode
              ? "Click map thêm đỉnh · Kéo đỉnh · Double-click xóa đỉnh · Publish tạo version mới."
              : tab === "anchor"
                ? "Kéo pin xanh hoặc nhập lat/lng — điểm fallback GPS."
                : "Chọn shop → kéo pin đúng vị trí thực tế → Xác nhận."}
          </p>

          {msg ? <p className="admin-workspace-msg ok">{msg}</p> : null}
          {err ? <p className="admin-workspace-msg err">{err}</p> : null}

          {mapEditMode ? (
            <>
              <div className="admin-workspace-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setRing((r) => r.slice(0, -1))}>
                  Xóa đỉnh cuối
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setRing([])}>
                  Xóa hết
                </button>
                <span className="stat">{ring.length} đỉnh</span>
              </div>
              {tab === "boundary" ? (
                <>
                  <div className="field">
                    <label htmlFor="reason">Lý do publish</label>
                    <input
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="VD: chỉnh theo hàng rào CT12"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn admin-btn"
                    disabled={saving}
                    onClick={() => void publishBoundary()}
                  >
                    {saving ? "Đang publish…" : "Publish ranh giới mới"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn admin-btn"
                  disabled={saving}
                  onClick={() => void saveServiceArea(tab === "core" ? "CORE" : "EXTENDED")}
                >
                  {saving
                    ? "Đang lưu…"
                    : tab === "core"
                      ? "Lưu vùng trung tâm"
                      : "Lưu vùng giao thoa"}
                </button>
              )}
            </>
          ) : null}

          {tab === "anchor" ? (
            <>
              <div className="admin-workspace-coords">
                <div className="field">
                  <label htmlFor="alat">Latitude</label>
                  <input
                    id="alat"
                    type="number"
                    step="0.00001"
                    value={anchor?.lat ?? ""}
                    onChange={(e) =>
                      setAnchor((a) => ({
                        lat: Number(e.target.value),
                        lng: a?.lng ?? center.lng,
                      }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="alng">Longitude</label>
                  <input
                    id="alng"
                    type="number"
                    step="0.00001"
                    value={anchor?.lng ?? ""}
                    onChange={(e) =>
                      setAnchor((a) => ({
                        lat: a?.lat ?? center.lat,
                        lng: Number(e.target.value),
                      }))
                    }
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn admin-btn"
                disabled={saving || !anchor}
                onClick={() => void saveAnchor()}
              >
                {saving ? "Đang lưu…" : "Lưu neo GPS"}
              </button>
            </>
          ) : null}

          {tab === "shops" ? (
            <>
              <div className="admin-workspace-shop-list">
                {data.locations.length === 0 ? (
                  <p className="stat">Chưa có quán</p>
                ) : (
                  data.locations.map((l) => (
                    <button
                      key={l.locationId}
                      type="button"
                      className={`admin-workspace-shop ${selectedShop === l.locationId ? "is-active" : ""}`}
                      onClick={() => selectShop(l.locationId)}
                    >
                      <strong>{l.brandName}</strong>
                      <span className="stat">
                        {l.needsPin ? "cần xác nhận" : "đã xác nhận"}
                      </span>
                    </button>
                  ))
                )}
              </div>
              {selectedShop && shopPin ? (
                <>
                  <div className="field">
                    <label htmlFor="saddr">Địa chỉ</label>
                    <input
                      id="saddr"
                      value={shopAddress}
                      onChange={(e) => setShopAddress(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="snote">Ghi chú thực địa</label>
                    <input
                      id="snote"
                      value={shopNote}
                      onChange={(e) => setShopNote(e.target.value)}
                      placeholder="Đứng trước cửa…"
                    />
                  </div>
                  <p className="stat">
                    {shopPin.lat.toFixed(6)}, {shopPin.lng.toFixed(6)}
                  </p>
                  <button
                    type="button"
                    className="btn admin-btn"
                    disabled={saving}
                    onClick={() => void confirmShopPin()}
                  >
                    {saving ? "Đang lưu…" : "Xác nhận vị trí shop"}
                  </button>
                  <div className="field" style={{ marginTop: 16 }}>
                    <label htmlFor="vstatus">Pickee Verified</label>
                    <select
                      id="vstatus"
                      value={verificationStatus}
                      onChange={(e) =>
                        setVerificationStatus(
                          e.target.value as "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED",
                        )
                      }
                    >
                      <option value="UNVERIFIED">Chưa xác minh</option>
                      <option value="PENDING">Đang xem</option>
                      <option value="VERIFIED">Đã xác minh</option>
                      <option value="REJECTED">Từ chối</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="vnote">Ghi chú xác minh</label>
                    <input
                      id="vnote"
                      value={verificationNote}
                      onChange={(e) => setVerificationNote(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn admin-btn"
                    disabled={saving}
                    onClick={() => void saveVerification()}
                  >
                    Lưu xác minh
                  </button>
                  {verificationStatus === "VERIFIED" ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={saving}
                      style={{ marginTop: 8 }}
                      onClick={() => void issueQr()}
                    >
                      {data.locations.find((l) => l.locationId === selectedShop)?.hasVerifiedQr
                        ? "Đổi QR"
                        : "Cấp QR"}
                    </button>
                  ) : null}
                  {qrPath ? (
                    <p className="stat">
                      In sticker: {qrPath}. Đổi mã sẽ làm sticker cũ hết hiệu lực.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="stat">Chọn shop trong danh sách.</p>
              )}
            </>
          ) : null}
        </div>
      </aside>

      <section className="admin-workspace-map" aria-label="Bản đồ Zone">
        <AdminZoneMapEditor
          key={`${tab}-${selectedShop ?? "none"}`}
          center={tab === "shops" && shopPin ? shopPin : center}
          editableRing={mapRing}
          onRingChange={mapEditMode ? setRing : () => undefined}
          overlays={overlays}
          draggablePin={mapPin}
          onPinChange={mapPinChange ?? undefined}
          pinLabel={mapPinLabel}
          height="100%"
          fill
          editMode={mapEditMode}
        />
      </section>
    </AdminPageShell>
  );
}
