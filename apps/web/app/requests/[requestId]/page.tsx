"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ServiceRequestZaloContact } from "../../components/service-request-zalo";
import { api } from "../../../lib/api";
import { isEducationVertical, isSportsVertical, serviceRequestStatusLabel } from "../../../lib/providers";

type ServiceRequest = {
  id: string;
  requestNumber: string;
  status: string;
  offeringName: string | null;
  providerBrandName: string | null;
  providerDisplayName: string | null;
  providerType: string | null;
  customerNote: string | null;
  providerNote: string | null;
  preferredAt: string | null;
  deliveryBuilding: string | null;
  deliveryApartment: string | null;
  deliveryNote: string | null;
  trialScheduledAt: string | null;
  trialLocationType: string | null;
  trialLocationDetail: string | null;
  trialTeacherName: string | null;
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

  const isEducation = isEducationVertical(request.providerType);
  const isSports = isSportsVertical(request.providerType);
  const canCancel =
    request.status === "OPEN" ||
    request.status === "CONFIRMED" ||
    request.status === "UPCOMING";

  return (
    <div className="container">
      <Link href="/requests" className="stat">
        ← Yêu cầu của tôi
      </Link>

      <div className="card" style={{ marginTop: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>{request.requestNumber}</h1>
        <p className="stat" style={{ margin: 0 }}>
          {serviceRequestStatusLabel(request.status, request.providerType)}
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <p className="section-title">
          {isEducation ? "Giáo dục / dịch vụ" : isSports ? "Sân / dịch vụ" : "Thợ / dịch vụ"}
        </p>
        <p style={{ margin: 0 }}>
          <strong>{request.providerBrandName}</strong>
          {request.providerDisplayName ? ` · ${request.providerDisplayName}` : ""}
        </p>
        {request.offeringName ? <p className="stat">{request.offeringName}</p> : null}
      </div>

      {isEducation && request.deliveryNote ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Địa chỉ nhà</p>
          <p style={{ margin: 0 }}>{request.deliveryNote}</p>
        </div>
      ) : null}

      {request.preferredAt ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">{isSports ? "Khung giờ muốn chơi" : "Thời gian mong muốn"}</p>
          <p style={{ margin: 0 }}>
            {new Date(request.preferredAt).toLocaleString("vi-VN", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      ) : null}

      {!isEducation && !isSports && (request.deliveryBuilding || request.deliveryApartment || request.deliveryNote) ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Địa chỉ</p>
          <p style={{ margin: 0 }}>
            {request.deliveryBuilding}-{request.deliveryApartment}
          </p>
          {request.deliveryNote ? <p className="stat">{request.deliveryNote}</p> : null}
        </div>
      ) : null}

      {request.trialScheduledAt ? (
        <div className="card" style={{ marginTop: 16, borderColor: "#9fd4b5" }}>
          <p className="section-title">Lịch học thử</p>
          <p style={{ margin: "0 0 6px" }}>
            {new Date(request.trialScheduledAt).toLocaleString("vi-VN", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {request.trialTeacherName ? (
            <p className="stat" style={{ margin: "0 0 6px" }}>
              Giáo viên: {request.trialTeacherName}
            </p>
          ) : null}
          {request.trialLocationDetail ? (
            <p className="stat" style={{ margin: 0 }}>
              {request.trialLocationType === "ONLINE" ? "Online" : "Tại"}:{" "}
              {request.trialLocationDetail}
            </p>
          ) : null}
        </div>
      ) : null}

      {request.customerNote ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Ghi chú của bạn</p>
          <p style={{ margin: 0 }}>{request.customerNote}</p>
        </div>
      ) : null}

      {request.contacts ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">Liên hệ qua Zalo</p>
          <ServiceRequestZaloContact
            role="customer"
            education={isEducation}
            sports={isSports}
            contacts={request.contacts}
          />
        </div>
      ) : null}

      {request.providerNote ? (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="section-title">
            {isEducation ? "Phản hồi trung tâm" : isSports ? "Phản hồi sân" : "Phản hồi thợ"}
          </p>
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
