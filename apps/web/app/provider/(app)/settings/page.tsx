"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import {
  ClassifiedPhotoPicker,
  type ClassifiedPhoto,
} from "../../../components/classified-photo-picker";
import { api } from "../../../../lib/api";
import { getCurrentPositionOnce } from "../../../../lib/geolocation";
import { PickeeMap } from "../../../components/pickee-map";
import { ProviderOpeningForm } from "./opening-form";

type Profile = {
  providerId: string;
  locationId: string;
  brandName: string;
  displayName: string;
  addressLine: string | null;
  lat: number | null;
  lng: number | null;
  pinVerifiedAt?: string | null;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
};

function hasIntroContent(p: Profile): boolean {
  return Boolean(p.tagline?.trim() || p.description?.trim() || p.logoUrl || p.coverUrl);
}

function applyProfileToForm(data: Profile) {
  return {
    tagline: data.tagline ?? "",
    description: data.description ?? "",
    logoPhotos: data.logoUrl
      ? [{ url: data.logoUrl, previewUrl: data.logoUrl, sizeLabel: "" } satisfies ClassifiedPhoto]
      : ([] as ClassifiedPhoto[]),
    coverPhotos: data.coverUrl
      ? [{ url: data.coverUrl, previewUrl: data.coverUrl, sizeLabel: "" } satisfies ClassifiedPhoto]
      : ([] as ClassifiedPhoto[]),
  };
}

export default function ProviderSettingsPage() {
  const router = useRouter();
  const { locations, locationId, setLocationId, activeLocation } = useProviderLocation();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [editing, setEditing] = useState(true);
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [logoPhotos, setLogoPhotos] = useState<ClassifiedPhoto[]>([]);
  const [coverPhotos, setCoverPhotos] = useState<ClassifiedPhoto[]>([]);
  const [addressLine, setAddressLine] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pinSaving, setPinSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (id: string) => {
    const data = await api<Profile>(`/provider/locations/${id}/profile`);
    setProfile(data);
    const form = applyProfileToForm(data);
    setTagline(form.tagline);
    setDescription(form.description);
    setLogoPhotos(form.logoPhotos);
    setCoverPhotos(form.coverPhotos);
    setAddressLine(data.addressLine ?? "");
    setPin(data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : null);
    setEditing(!hasIntroContent(data));
    setToast(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    void loadProfile(locationId).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải được hồ sơ");
    });
  }, [locationId, loadProfile]);

  function startEdit() {
    if (profile) {
      const form = applyProfileToForm(profile);
      setTagline(form.tagline);
      setDescription(form.description);
      setLogoPhotos(form.logoPhotos);
      setCoverPhotos(form.coverPhotos);
    }
    setToast(null);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    if (profile) {
      const form = applyProfileToForm(profile);
      setTagline(form.tagline);
      setDescription(form.description);
      setLogoPhotos(form.logoPhotos);
      setCoverPhotos(form.coverPhotos);
    }
    setError(null);
    setToast(null);
    setEditing(false);
  }

  async function saveProfile() {
    if (!locationId) return;
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const data = await api<Profile>(`/provider/locations/${locationId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          tagline,
          description,
          logoUrl: logoPhotos[0]?.url ?? "",
          coverUrl: coverPhotos[0]?.url ?? "",
        }),
      });
      setProfile(data);
      const form = applyProfileToForm(data);
      setTagline(form.tagline);
      setDescription(form.description);
      setLogoPhotos(form.logoPhotos);
      setCoverPhotos(form.coverPhotos);
      setEditing(false);
      setToast("Đã lưu — khách thấy ở tab Giới thiệu");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  async function savePin() {
    if (!locationId || !pin) return;
    setPinSaving(true);
    setError(null);
    try {
      const data = await api<Profile>(`/provider/locations/${locationId}/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          addressLine: addressLine.trim() || undefined,
          lat: pin.lat,
          lng: pin.lng,
        }),
      });
      setProfile(data);
      setAddressLine(data.addressLine ?? "");
      setPin(data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : pin);
      setToast("Đã lưu vị trí quán — khách xem / chỉ đường được ngay");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được vị trí");
    } finally {
      setPinSaving(false);
    }
  }

  async function locateShop() {
    const geo = await getCurrentPositionOnce({ timeoutMs: 10000 });
    setPin(geo.position);
    if (geo.source !== "gps") {
      setError(geo.error ?? "GPS không sẵn — đang dùng vị trí tạm");
    } else {
      setError(null);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    localStorage.removeItem("picki-provider-location");
    router.replace("/provider/login");
  }

  return (
    <ProviderPageShell title="Cài đặt">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Chi nhánh</p>
        {locations.length <= 1 ? (
          <p className="stat" style={{ margin: 0 }}>
            {activeLocation?.brandName} — {activeLocation?.locationName}
          </p>
        ) : (
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="location">Chọn quán</label>
            <select
              id="location"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
              }}
            >
              {locations.map((l) => (
                <option key={l.locationId} value={l.locationId ?? ""}>
                  {l.brandName} — {l.locationName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Vị trí trên bản đồ</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Kéo pin cam trên map, hoặc bấm vào map để đặt pin · hoặc Lấy GPS tại quán.
        </p>
        <label className="field">
          <span>Địa chỉ hiển thị</span>
          <input
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            placeholder="VD: CT12 Kim Văn, Hoàng Mai"
          />
        </label>
        {pin ? (
          <div style={{ marginBottom: 12, borderRadius: 16, overflow: "hidden" }}>
            <PickeeMap
              center={pin}
              markers={[{ id: "shop", lat: pin.lat, lng: pin.lng, label: "Quán", kind: "provider" }]}
              height={240}
              zoom={17}
              fitMarkers={false}
              draggableId="shop"
              onMarkerDrag={(_id, pos) => setPin(pos)}
              onMapClick={(pos) => setPin(pos)}
            />
          </div>
        ) : (
          <div style={{ marginBottom: 12, borderRadius: 16, overflow: "hidden" }}>
            <PickeeMap
              center={{ lat: 20.9883, lng: 105.8414 }}
              markers={[]}
              height={240}
              zoom={16}
              fitMarkers={false}
              onMapClick={(pos) => setPin(pos)}
            />
            <p className="stat" style={{ padding: "8px 0 0" }}>
              Bấm vào map để đặt pin, hoặc Lấy GPS hiện tại.
            </p>
          </div>
        )}
        <p className="stat">
          {pin
            ? `${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}${profile?.pinVerifiedAt ? " · đã xác nhận" : ""}`
            : "—"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto" }}
            onClick={() => void locateShop()}
          >
            Lấy GPS hiện tại
          </button>
          <button
            type="button"
            className="btn"
            style={{ width: "auto" }}
            disabled={pinSaving || !pin}
            onClick={() => void savePin()}
          >
            {pinSaving ? "Đang lưu…" : "Lưu vị trí quán"}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Giới thiệu (khách xem)</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Logo, ảnh bìa, mô tả hiện ở tab <strong>Giới thiệu</strong> trên trang quán.
        </p>
        {profile?.addressLine ? (
          <p className="stat">Địa chỉ: {profile.addressLine}</p>
        ) : null}

        {!editing && profile ? (
          <>
            <div className="location-intro-head" style={{ marginTop: 12 }}>
              {profile.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logoUrl} alt="" className="location-intro-logo" />
              ) : (
                <div className="location-intro-logo location-intro-logo--fallback" aria-hidden>
                  {(profile.brandName.trim().charAt(0) || "?").toUpperCase()}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: "0 0 4px", fontWeight: 600 }}>{profile.brandName}</p>
                {profile.tagline ? (
                  <p className="stat" style={{ margin: 0 }}>
                    {profile.tagline}
                  </p>
                ) : (
                  <p className="stat" style={{ margin: 0 }}>
                    Chưa có tagline
                  </p>
                )}
              </div>
            </div>
            {profile.coverUrl ? (
              <div className="location-intro-cover" style={{ marginTop: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.coverUrl} alt="" />
              </div>
            ) : null}
            {profile.description ? (
              <p style={{ margin: "12px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {profile.description}
              </p>
            ) : (
              <p className="stat" style={{ margin: "12px 0 0" }}>
                Chưa có mô tả
              </p>
            )}
            {toast ? (
              <p className="stat" style={{ color: "#1b4332", marginTop: 12 }}>
                {toast}
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              onClick={startEdit}
            >
              Chỉnh sửa
            </button>
          </>
        ) : (
          <>
            <label className="field">
              <span>Tagline</span>
              <input
                value={tagline}
                maxLength={160}
                placeholder="VD: Phở bò quanh CT12 — nước dùng ninh xương"
                onChange={(e) => setTagline(e.target.value)}
              />
            </label>

            <label className="field">
              <span>Mô tả</span>
              <textarea
                value={description}
                rows={5}
                maxLength={2000}
                placeholder="Giới thiệu quán, giờ mở cửa, món nổi bật…"
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <div className="field">
              <span>Logo (1 ảnh)</span>
              <ClassifiedPhotoPicker
                photos={logoPhotos}
                onChange={(p) => setLogoPhotos(p.slice(0, 1))}
                disabled={saving}
                maxPhotos={1}
              />
            </div>

            <div className="field">
              <span>Ảnh bìa (1 ảnh)</span>
              <ClassifiedPhotoPicker
                photos={coverPhotos}
                onChange={(p) => setCoverPhotos(p.slice(0, 1))}
                disabled={saving}
                maxPhotos={1}
              />
            </div>

            {error ? (
              <p className="stat" style={{ color: "#c0392b" }}>
                {error}
              </p>
            ) : null}

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <button
                type="button"
                className="btn"
                disabled={saving || !locationId}
                onClick={() => void saveProfile()}
                style={{ flex: 1, minWidth: 140 }}
              >
                {saving ? "Đang lưu…" : "Lưu giới thiệu"}
              </button>
              {profile && hasIntroContent(profile) ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={cancelEdit}
                  style={{ flex: 1, minWidth: 100 }}
                >
                  Hủy
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Habit-First</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Đăng nhanh &quot;Hôm nay có&quot; cho khách trong Zone · nhãn khách quen trên đơn.
        </p>
        <Link href="/provider/today" className="btn" style={{ display: "block", marginBottom: 8, textAlign: "center" }}>
          Hôm nay có →
        </Link>
        <Link
          href="/provider/loyalty"
          className="btn btn-secondary"
          style={{ display: "block", textAlign: "center" }}
        >
          Khách quen / VIP →
        </Link>
      </div>

      {locationId ? <ProviderOpeningForm locationId={locationId} /> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Ứng dụng</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Cài Pickee Provider lên màn hình chính (Add to Home Screen) để mở nhanh như app native.
        </p>
        <p className="stat">Tab Đơn tự làm mới mỗi 15 giây khi app đang mở.</p>
      </div>

      <div className="card">
        <p className="section-title">Khác</p>
        <Link href="/" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Customer app →
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </ProviderPageShell>
  );
}
