"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

export type AdminZoneAccess = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  access: "admin" | "operator" | "support";
};

export type AdminCityAccess = {
  id: string;
  code: string;
  slug: string;
  label: string;
  access: "admin" | "support";
};

export type AdminSessionInfo = {
  superAdmin: boolean;
  supportReadOnlyGlobal: boolean;
  financeGlobal: boolean;
  zones: AdminZoneAccess[];
  cities: AdminCityAccess[];
};

export function canSeeCityContent(session: AdminSessionInfo): boolean {
  return session.superAdmin || session.supportReadOnlyGlobal || session.cities.length > 0;
}

type AdminSessionContextValue = {
  loading: boolean;
  accessError: string | null;
  session: AdminSessionInfo | null;
  verifyAccess: () => Promise<void>;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [session, setSession] = useState<AdminSessionInfo | null>(null);

  const verifyAccess = useCallback(async () => {
    await api("/me");
    const next = await api<AdminSessionInfo>("/admin/session");
    setSession(next);
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
    () => ({ loading, accessError, session, verifyAccess }),
    [loading, accessError, session, verifyAccess],
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
  variant = "default",
}: {
  title: string;
  children: React.ReactNode;
  /** Full-bleed desktop workspace (Zone map setup) */
  variant?: "default" | "workspace";
}) {
  const { loading, accessError } = useAdminSession();

  if (loading) {
    return (
      <div className={variant === "workspace" ? "admin-workspace-shell" : "container admin-container"}>
        <p className="tagline">Pickee Ops…</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="container admin-container">
        <div className="logo admin-logo">Pickee Ops</div>
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ color: "crimson", margin: 0 }}>{accessError}</p>
          <Link href="/admin/login" className="stat" style={{ display: "block", marginTop: 12 }}>
            ← Đăng nhập lại
          </Link>
        </div>
      </div>
    );
  }

  if (variant === "workspace") {
    return (
      <div className="admin-workspace-shell">
        <header className="admin-workspace-top">
          <div className="admin-workspace-top-left">
            <span className="logo admin-logo" style={{ fontSize: 18 }}>
              Pickee Ops
            </span>
            <span className="admin-workspace-title">{title}</span>
          </div>
          <span className="badge admin-badge">Quản trị</span>
        </header>
        <div className="admin-workspace-body">{children}</div>
      </div>
    );
  }

  return (
    <div className="container admin-container">
      <div className="header-row">
        <div>
          <div className="logo admin-logo">Pickee Ops</div>
          <div className="tagline">{title}</div>
        </div>
        <span className="badge admin-badge">Quản trị</span>
      </div>
      {children}
    </div>
  );
}
