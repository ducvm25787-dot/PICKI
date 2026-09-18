"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { NotificationBell } from "./notification-bell";

export type RunnerOrder = {
  id: string;
  orderNumber: string;
  providerBrandName?: string | null;
  status: string;
  serviceVertical?: string;
  orderKind?: string;
  serviceDate?: string | null;
  deliveryFeeVnd?: number;
  totalVnd: number;
  assignedToMe: boolean;
  estimatedReadyAt: string | null;
  providerHandoffAt: string | null;
  runnerSoughtAt: string | null;
  routeId: string | null;
  deliveryWindow?: { startsAt: string; endsAt: string; label: string } | null;
  delivery: { building: string | null; apartment: string | null };
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
    runner?: { phone: string | null; displayName?: string | null } | null;
  };
};

export type LobbyHandoff = {
  orderId: string;
  orderNumber: string;
  apartment: string | null;
  customerStatus: string;
};

export type RouteStop = {
  id: string;
  sequence: number;
  stopType: string;
  status: string;
  label: string;
  lat?: number | null;
  lng?: number | null;
  handoffs?: LobbyHandoff[];
};

export type ActiveRoute = {
  id: string;
  status: string;
  orderCount: number;
  stops: RouteStop[];
};

type RunnerSessionContextValue = {
  presence: string;
  orders: RunnerOrder[];
  pool: RunnerOrder[];
  mine: RunnerOrder[];
  route: ActiveRoute | null;
  loading: boolean;
  accessError: string | null;
  refresh: () => Promise<void>;
  setPresenceStatus: (status: string) => Promise<void>;
};

const RunnerSessionContext = createContext<RunnerSessionContextValue | null>(null);

export function RunnerSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [presence, setPresence] = useState("OFFLINE");
  const [orders, setOrders] = useState<RunnerOrder[]>([]);
  const [pool, setPool] = useState<RunnerOrder[]>([]);
  const [mine, setMine] = useState<RunnerOrder[]>([]);
  const [route, setRoute] = useState<ActiveRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [profile, list, activeRoute] = await Promise.all([
      api<{ presence: string }>("/runner/profile"),
      api<{ orders: RunnerOrder[]; pool: RunnerOrder[]; mine: RunnerOrder[] }>("/runner/orders"),
      api<{ route: ActiveRoute | null }>("/runner/route/active"),
    ]);
    setPresence(profile.presence);
    setOrders(list.orders);
    setPool(list.pool ?? list.orders.filter((o) => !o.assignedToMe));
    setMine(list.mine ?? list.orders.filter((o) => o.assignedToMe));
    setRoute(activeRoute.route);
    setAccessError(null);
  }, []);

  useEffect(() => {
    void refresh()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("Runner profile not found")) {
          setAccessError(
            "Tài khoản này chưa có hồ sơ Runner demo. Chạy: pnpm db:seed. Số demo: 0908888002.",
          );
          return;
        }
        router.replace("/runner/login");
      })
      .finally(() => setLoading(false));
  }, [refresh, router]);

  const setPresenceStatus = useCallback(
    async (status: string) => {
      await api("/runner/presence", {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setPresence(status);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      presence,
      orders,
      pool,
      mine,
      route,
      loading,
      accessError,
      refresh,
      setPresenceStatus,
    }),
    [presence, orders, pool, mine, route, loading, accessError, refresh, setPresenceStatus],
  );

  return <RunnerSessionContext.Provider value={value}>{children}</RunnerSessionContext.Provider>;
}

export function useRunnerSession() {
  const ctx = useContext(RunnerSessionContext);
  if (!ctx) {
    throw new Error("useRunnerSession must be used within RunnerSessionProvider");
  }
  return ctx;
}

export function RunnerPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { loading, accessError } = useRunnerSession();

  if (loading) {
    return (
      <div className="container runner-container">
        <p className="tagline">Pickee Runner…</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="container runner-container">
        <div className="logo runner-logo">Pickee Runner</div>
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ color: "crimson", margin: 0 }}>{accessError}</p>
          <Link href="/runner/login" className="stat" style={{ display: "block", marginTop: 12 }}>
            ← Đăng nhập lại
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container runner-container">
      <div className="header-row">
        <div>
          <div className="logo runner-logo">Pickee Runner</div>
          <div className="tagline">{title}</div>
        </div>
        <NotificationBell audience="runner" desktopAlerts />
      </div>
      {children}
    </div>
  );
}

export function lobbyStatusLabel(status: string): string {
  switch (status) {
    case "COMING_DOWN":
      return "Đang xuống";
    case "RECEIVED":
      return "Đã nhận";
    case "NO_RESPONSE":
      return "Chưa phản hồi";
    default:
      return "Chờ khách";
  }
}
