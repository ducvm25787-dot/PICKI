"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { NotificationBell } from "./notification-bell";

export type ProviderLocation = {
  providerId: string;
  providerSlug: string;
  brandName: string;
  providerType?: string;
  locationId: string | null;
  locationName: string;
  role: string;
};

type ProviderLocationContextValue = {
  locations: ProviderLocation[];
  locationId: string;
  activeLocation: ProviderLocation | undefined;
  loading: boolean;
  accessError: string | null;
  setLocationId: (id: string) => void;
  refreshLocations: () => Promise<void>;
};

const ProviderLocationContext = createContext<ProviderLocationContextValue | null>(null);

const STORAGE_KEY = "picki-provider-location";

export function ProviderLocationProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [locations, setLocations] = useState<ProviderLocation[]>([]);
  const [locationId, setLocationIdState] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);

  const refreshLocations = useCallback(async () => {
    await api("/me");
    const locs = await api<{ locations: ProviderLocation[] }>("/provider/locations/mine");
    const withIds = locs.locations.filter((l): l is ProviderLocation & { locationId: string } => !!l.locationId);

    if (withIds.length === 0) {
      setAccessError(
        "Tài khoản này chưa được gán quán demo. Chạy: pnpm db:seed (hoặc seed:ops). Số demo: 0908888001.",
      );
      setLocations([]);
      setLocationIdState("");
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    setLocations(withIds);
    setAccessError(null);

    const stored = localStorage.getItem(STORAGE_KEY);
    const validStored = withIds.find((l) => l.locationId === stored)?.locationId;
    if (stored && !validStored) {
      localStorage.removeItem(STORAGE_KEY);
    }
    const pick = validStored ?? withIds[0]?.locationId ?? "";
    setLocationIdState(pick);
    if (pick) localStorage.setItem(STORAGE_KEY, pick);
  }, []);

  useEffect(() => {
    void refreshLocations()
      .catch(() => {
        router.replace("/provider/login");
      })
      .finally(() => setLoading(false));
  }, [refreshLocations, router]);

  const setLocationId = useCallback((id: string) => {
    setLocationIdState((prev) => {
      const allowed = locations.some((l) => l.locationId === id);
      const next = allowed ? id : prev;
      if (next) localStorage.setItem(STORAGE_KEY, next);
      else localStorage.removeItem(STORAGE_KEY);
      return next;
    });
  }, [locations]);

  const activeLocation = useMemo(
    () => locations.find((l) => l.locationId === locationId),
    [locations, locationId],
  );

  const value = useMemo(
    () => ({
      locations,
      locationId,
      activeLocation,
      loading,
      accessError,
      setLocationId,
      refreshLocations,
    }),
    [locations, locationId, activeLocation, loading, accessError, setLocationId, refreshLocations],
  );

  return <ProviderLocationContext.Provider value={value}>{children}</ProviderLocationContext.Provider>;
}

export function useProviderLocation() {
  const ctx = useContext(ProviderLocationContext);
  if (!ctx) {
    throw new Error("useProviderLocation must be used within ProviderLocationProvider");
  }
  return ctx;
}

export function ProviderPageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { loading, accessError, activeLocation } = useProviderLocation();

  if (loading) {
    return (
      <div className="container provider-container">
        <p className="tagline">Picki Provider…</p>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="container provider-container">
        <div className="logo provider-logo">Picki Provider</div>
        <div className="card" style={{ marginTop: 16 }}>
          <p style={{ color: "crimson", margin: 0 }}>{accessError}</p>
          <Link href="/provider/login" className="stat" style={{ display: "block", marginTop: 12 }}>
            ← Đăng nhập lại
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container provider-container">
      <div className="header-row">
        <div>
          <div className="logo provider-logo">Picki Provider</div>
          <div className="tagline">{activeLocation?.brandName ?? title}</div>
        </div>
        <NotificationBell audience="provider" />
      </div>
      {children}
    </div>
  );
}
