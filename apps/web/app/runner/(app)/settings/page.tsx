"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RunnerPageShell } from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";

export default function RunnerSettingsPage() {
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/runner/login");
  }

  return (
    <RunnerPageShell title="Cài đặt">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Ứng dụng</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Cài Picki Runner lên màn hình chính (Add to Home Screen) để mở nhanh khi giao hàng.
        </p>
        <p className="stat">Tab Đơn và Route tự làm mới mỗi 15 giây.</p>
      </div>

      <div className="card">
        <p className="section-title">Khác</p>
        <Link href="/" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Customer app →
        </Link>
        <Link href="/provider/login" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Provider app →
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </RunnerPageShell>
  );
}
