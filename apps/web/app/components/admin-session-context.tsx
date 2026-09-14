"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type AdminSessionContextValue = {
  loading: boolean;
  accessError: string | null;
  verifyAccess: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const verifyAccess = useCallback(async () => {
    await api("/me");
    await api("/admin/dashboard");
    setAccessError(null);
  }, []);

  useEffect(() => {
    void verifyAccess()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Admin access required") || msg.includes("Forbidden")) {
          setAccessError("Tài khoản này không có quyền Admin. Demo: 0908888003 (pnpm db:seed).");
          return;
        }
        router.replace("/admin/login");
      })
      .finally(() => setLoading(false));
  }, [verifyAccess, router]);

  const value = useMemo(
    () => ({ loading, accessError, verifyAccess }),
    [loading, accessError, verifyAccess],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider");
  }
  return ctx;
}

export function AdminPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { loading, accessError } = useAdminSession();

  if (loading) {
    return (
      <div className="container admin-container">
        <p className="tagline">Picki Ops…</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="container admin-container">
        <div className="logo admin-logo">Picki Ops</div>
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ color: "crimson", margin: 0 }}>{accessError}</p>
          <Link href="/admin/login" className="stat" style={{ display: "block", marginTop: 12 }}>
            ← Đăng nhập lại
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container admin-container">
      <div className="header-row">
        <div>
          <div className="logo admin-logo">Picki Ops</div>
          <div className="tagline">{title}</div>
        </div>
        <span className="badge admin-badge">Admin</span>
      </div>
      {children}
    </div>
  );
}
