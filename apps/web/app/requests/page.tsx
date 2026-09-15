"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "../components/notification-bell";
import { api } from "../../lib/api";
import { serviceRequestStatusLabel } from "../../lib/providers";

type ServiceRequest = {
  id: string;
  requestNumber: string;
  status: string;
  offeringName: string | null;
  providerBrandName: string | null;
  providerType: string | null;
  customerNote: string | null;
  createdAt: string;
};

function isActive(status: string) {
  return !["COMPLETED", "CANCELLED", "PROVIDER_REJECTED"].includes(status);
}

export default function RequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api<{ requests: ServiceRequest[] }>("/service-requests/mine");
        setRequests(res.requests);
      } catch {
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const active = requests.filter((r) => isActive(r.status));
  const finished = requests.filter((r) => !isActive(r.status));

  if (loading) {
    return (
      <div className="container">
        <p className="tagline">Đang tải yêu cầu…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <h1 style={{ margin: 0, fontSize: 22 }}>Yêu cầu dịch vụ</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <NotificationBell audience="customer" />
          <Link href="/" className="stat">
            ← Trang chủ
          </Link>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="card">
          <p className="stat">Chưa có yêu cầu — chọn thợ trong mục Dịch vụ nhà trên trang chủ.</p>
        </div>
      ) : (
        <>
          <section className="order-list-section">
            <h2 className="order-list-section-title">
              <span className="order-list-section-icon order-list-section-icon-active">⏳</span>
              Đang xử lý
            </h2>
            {active.length === 0 ? (
              <p className="stat order-list-empty">Không có yêu cầu đang xử lý.</p>
            ) : (
              <div className="provider-list">
                {active.map((r) => (
                  <Link
                    key={r.id}
                    href={`/requests/${r.id}`}
                    className="provider-card order-list-card order-list-card-active"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <strong>{r.requestNumber}</strong>
                    <p className="stat" style={{ margin: "6px 0" }}>
                      {r.providerBrandName}
                      {r.offeringName ? ` · ${r.offeringName}` : ""}
                    </p>
                    <p style={{ margin: 0 }}>
                      {serviceRequestStatusLabel(r.status, r.providerType)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {finished.length > 0 ? (
            <section className="order-list-section order-list-section-finished">
              <h2 className="order-list-section-title">
                <span className="order-list-section-icon">✓</span>
                Đã kết thúc
              </h2>
              <div className="provider-list">
                {finished.map((r) => (
                  <Link
                    key={r.id}
                    href={`/requests/${r.id}`}
                    className="provider-card order-list-card order-list-card-finished"
                    style={{ display: "block", textDecoration: "none", color: "inherit" }}
                  >
                    <strong>{r.requestNumber}</strong>
                    <p className="stat" style={{ margin: "6px 0" }}>
                      {r.providerBrandName}
                    </p>
                    <p style={{ margin: 0 }}>
                      {serviceRequestStatusLabel(r.status, r.providerType)}
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
