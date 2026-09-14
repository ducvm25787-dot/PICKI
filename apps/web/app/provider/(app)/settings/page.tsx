"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";

export default function ProviderSettingsPage() {
  const router = useRouter();
  const { locations, locationId, setLocationId, activeLocation } = useProviderLocation();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
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
        <p className="section-title">Ứng dụng</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Cài Picki Provider lên màn hình chính (Add to Home Screen) để mở nhanh như app native.
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
