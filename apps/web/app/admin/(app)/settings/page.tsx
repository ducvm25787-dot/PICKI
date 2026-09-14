"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminPageShell } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";

export default function AdminSettingsPage() {
  const router = useRouter();

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  return (
    <AdminPageShell title="Cài đặt">
      <div className="card">
        <p className="section-title">Apps</p>
        <Link href="/" className="stat" style={{ display: "block", marginBottom: 8 }}>
          Customer →
        </Link>
        <Link href="/provider/login" className="stat" style={{ display: "block", marginBottom: 8 }}>
          Provider →
        </Link>
        <Link href="/runner/login" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Runner →
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </AdminPageShell>
  );
}
