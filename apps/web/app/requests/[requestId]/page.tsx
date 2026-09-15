"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ServiceRequestZaloContact } from "../../components/service-request-zalo";
import { api } from "../../../lib/api";
import { serviceRequestStatusLabel } from "../../../lib/providers";

type ServiceRequest = {
  id: string;
  requestNumber: string;
  status: string;
  offeringName: string | null;
  providerBrandName: string | null;
  providerDisplayName: string | null;
  customerNote: string | null;
  providerNote: string | null;
  preferredAt: string | null;
  deliveryBuilding: string | null;
  deliveryApartment: string | null;
  deliveryNote: string | null;
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
  };
  createdAt: string;
};

export default function RequestDetailPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api<ServiceRequest>(`/service-requests/${params.requestId}`);
        setRequest(data);
      } catch {
        router.replace("/requests");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.requestId, router]);

  async function cancel() {
    if (!request || busy) return;
    setBusy(true);
    try {
      const updated = await api<ServiceRequest>(`/service-requests/${request.id}/cancel`, {
        method: "PATCH",
      });
      setRequest(updated);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !request) {
    return (
      <div className="container">
        <p className="tagline">Đang tải…</p>
      </div>
    );
  }

  const canCancel = request.status === "OPEN" || request.status === "CONFIRMED";

  return (
    <div className="container">
      <Link href="/requests" className="stat">
        ← Yêu cầu của tôi
      </Link>

      <div className="card" style={{ marginTop: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>{request.requestNumber}</h1>
        <p className="stat" style={{ margin: 0 }}>
          {serviceRequestStatusLabel(request.status)}
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="section-title">Thợ / dịch vụ</p>
        <p style={{ margin: 0 }}>
          <strong>{request.providerBrandName}</strong>
          {request.providerDisplayName ? ` · ${request.providerDisplayName}` : ""}
        </p>
        {request.offeringName ? <p className="stat">{request.offeringName}</p> : null}
      </div>

      {(request.deliveryBuilding || request.deliveryApartment || request.deliveryNote) && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Địa chỉ</p>
          <p style={{ margin: 0 }}>
            {request.deliveryBuilding}-{request.deliveryApartment}
          </p>
          {request.deliveryNote ? <p className="stat">{request.deliveryNote}</p> : null}
        </div>
      )}

      {request.customerNote ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Ghi chú của bạn</p>
          <p style={{ margin: 0 }}>{request.customerNote}</p>
        </div>
      ) : null}

      {request.contacts ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Liên hệ qua Zalo</p>
          <ServiceRequestZaloContact role="customer" contacts={request.contacts} />
        </div>
      ) : null}

      {request.providerNote ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Phản hồi thợ</p>
          <p style={{ margin: 0 }}>{request.providerNote}</p>
        </div>
      ) : null}

      {canCancel ? (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 16 }}
          disabled={busy}
          onClick={() => void cancel()}
        >
          Hủy yêu cầu
        </button>
      ) : null}
    </div>
  );
}
