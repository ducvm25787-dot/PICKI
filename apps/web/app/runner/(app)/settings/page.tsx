"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RunnerPageShell } from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";

export default function RunnerSettingsPage() {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void api<{ enabled: boolean }>("/notifications/push/vapid-key")
      .then((r) => setPushEnabled(r.enabled))
      .catch(() => setPushEnabled(false));
  }, []);

  async function testPush() {
    setTesting(true);
    setPushStatus(null);
    try {
      await api("/notifications/push/test", { method: "POST" });
      setPushStatus("Đã gửi — kiểm tra popup hệ thống (thu nhỏ tab rồi bấm lại).");
    } catch (e) {
      setPushStatus(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setTesting(false);
    }
  }

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
        <p className="stat">Tab Đơn và Tiến trình tự làm mới mỗi 15 giây.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Thông báo nền</p>
        {pushEnabled === null ? (
          <p className="stat">Đang kiểm tra…</p>
        ) : pushEnabled ? (
          <>
            <p className="stat" style={{ marginTop: 0 }}>
              Web Push đã bật. Cho phép notification khi trình duyệt hỏi.
            </p>
            <button
              type="button"
              className="btn runner-btn"
              style={{ width: "auto", marginTop: 8 }}
              disabled={testing}
              onClick={() => void testPush()}
            >
              {testing ? "Đang gửi…" : "Gửi push thử"}
            </button>
            {pushStatus ? (
              <p className="stat" style={{ margin: "8px 0 0", fontSize: 14 }}>
                {pushStatus}
              </p>
            ) : null}
          </>
        ) : (
          <p className="stat" style={{ margin: 0 }}>
            Push chưa cấu hình — thêm VAPID_* vào .env và restart server.
          </p>
        )}
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
