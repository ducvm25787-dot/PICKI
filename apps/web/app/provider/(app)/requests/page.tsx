"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ServiceRequestZaloContact } from "../../../components/service-request-zalo";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { isEducationVertical, isSportsVertical, serviceRequestStatusLabel } from "../../../../lib/providers";

type ServiceRequest = {
  id: string;
  requestNumber: string;
  status: string;
  offeringName: string | null;
  customerNote: string | null;
  providerNote: string | null;
  preferredAt: string | null;
  deliveryBuilding: string | null;
  deliveryApartment: string | null;
  deliveryNote: string | null;
  trialScheduledAt: string | null;
  trialLocationType: string | null;
  trialLocationDetail: string | null;
  trialOnlinePlatform: string | null;
  trialTeacherName: string | null;
  contacts?: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
  };
  createdAt: string;
};

type TrialDraft = {
  scheduledAt: string;
  locationType: "OFFLINE" | "ONLINE";
  offlineAddress: string;
  onlinePlatform: "ZOOM" | "GOOGLE_MEET" | "OTHER";
  onlineDetail: string;
  teacherName: string;
};

function defaultTrialDraft(): TrialDraft {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    scheduledAt: `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`,
    locationType: "OFFLINE",
    offlineAddress: "",
    onlinePlatform: "ZOOM",
    onlineDetail: "",
    teacherName: "",
  };
}

function formatTrialSummary(r: ServiceRequest): string {
  if (!r.trialScheduledAt) return "";
  const when = new Date(r.trialScheduledAt).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const place =
    r.trialLocationType === "ONLINE"
      ? `Online · ${r.trialLocationDetail ?? ""}`
      : (r.trialLocationDetail ?? "");
  return `${when}${r.trialTeacherName ? ` · GV ${r.trialTeacherName}` : ""}${place ? ` · ${place}` : ""}`;
}

function TrialScheduleForm({
  requestId,
  busy,
  onSubmit,
}: {
  requestId: string;
  busy: boolean;
  onSubmit: (id: string, draft: TrialDraft) => void;
}) {
  const [draft, setDraft] = useState<TrialDraft>(defaultTrialDraft);

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
      <p className="section-title" style={{ marginBottom: 8 }}>
        Tạo lịch học thử
      </p>
      <label className="stat" htmlFor={`trial-at-${requestId}`}>
        Thời gian học
      </label>
      <input
        id={`trial-at-${requestId}`}
        type="datetime-local"
        value={draft.scheduledAt}
        onChange={(e) => setDraft((d) => ({ ...d, scheduledAt: e.target.value }))}
        style={{ width: "100%", marginBottom: 8, padding: 8 }}
      />
      <p className="stat" style={{ margin: "0 0 8px" }}>
        Hình thức
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {(["OFFLINE", "ONLINE"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={draft.locationType === mode ? "btn provider-btn" : "btn btn-secondary"}
            style={{ width: "auto", padding: "8px 12px" }}
            onClick={() => setDraft((d) => ({ ...d, locationType: mode }))}
          >
            {mode === "OFFLINE" ? "Offline" : "Online"}
          </button>
        ))}
      </div>
      {draft.locationType === "OFFLINE" ? (
        <>
          <label className="stat" htmlFor={`trial-place-${requestId}`}>
            Địa điểm học offline
          </label>
          <input
            id={`trial-place-${requestId}`}
            value={draft.offlineAddress}
            onChange={(e) => setDraft((d) => ({ ...d, offlineAddress: e.target.value }))}
            placeholder="VD: Lớp 201 CT12 hoặc 15 ngõ Đại Kim"
            style={{ width: "100%", marginBottom: 8, padding: 8 }}
          />
        </>
      ) : (
        <>
          <label className="stat" htmlFor={`trial-platform-${requestId}`}>
            Nền tảng học online
          </label>
          <select
            id={`trial-platform-${requestId}`}
            value={draft.onlinePlatform}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                onlinePlatform: e.target.value as TrialDraft["onlinePlatform"],
              }))
            }
            style={{ width: "100%", marginBottom: 8, padding: 8 }}
          >
            <option value="ZOOM">Zoom</option>
            <option value="GOOGLE_MEET">Google Meet</option>
            <option value="OTHER">Nền tảng khác</option>
          </select>
          {draft.onlinePlatform === "OTHER" ? (
            <input
              value={draft.onlineDetail}
              onChange={(e) => setDraft((d) => ({ ...d, onlineDetail: e.target.value }))}
              placeholder="Tên nền tảng (VD: Teams, Zalo Meet…)"
              style={{ width: "100%", marginBottom: 8, padding: 8 }}
            />
          ) : null}
        </>
      )}
      <label className="stat" htmlFor={`trial-teacher-${requestId}`}>
        Giáo viên
      </label>
      <input
        id={`trial-teacher-${requestId}`}
        value={draft.teacherName}
        onChange={(e) => setDraft((d) => ({ ...d, teacherName: e.target.value }))}
        placeholder="Tên giáo viên phụ trách"
        style={{ width: "100%", marginBottom: 10, padding: 8 }}
      />
      <button
        type="button"
        className="btn provider-btn"
        style={{ width: "auto", padding: "8px 12px" }}
        disabled={busy}
        onClick={() => onSubmit(requestId, draft)}
      >
        Tạo buổi học thử
      </button>
    </div>
  );
}

function RequestCard({
  r,
  busy,
  isEducation,
  providerType,
  focusId,
  rejectId,
  rejectNote,
  onRejectNote,
  onRejectOpen,
  onAction,
  onScheduleTrial,
}: {
  r: ServiceRequest;
  busy: boolean;
  isEducation: boolean;
  providerType?: string | null;
  focusId: string | null;
  rejectId: string | null;
  rejectNote: string;
  onRejectNote: (v: string) => void;
  onRejectOpen: (id: string) => void;
  onAction: (id: string, action: "accept" | "reject" | "start" | "complete", note?: string) => void;
  onScheduleTrial: (id: string, draft: TrialDraft) => void;
}) {
  return (
    <article
      id={`service-request-${r.id}`}
      className={
        focusId === r.id ? "provider-card order-focus-highlight" : "provider-card"
      }
    >
      <strong>{r.requestNumber}</strong>
      <p className="stat" style={{ margin: "6px 0" }}>
        {serviceRequestStatusLabel(r.status, providerType)}
        {r.offeringName ? ` · ${r.offeringName}` : ""}
      </p>
      {r.status === "UPCOMING" && r.trialScheduledAt ? (
        <p className="stat" style={{ margin: "0 0 6px", fontSize: 13, color: "#2d6a4f" }}>
          {formatTrialSummary(r)}
        </p>
      ) : null}
      {isEducation && r.deliveryNote ? (
        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          Địa chỉ nhà: {r.deliveryNote}
        </p>
      ) : null}
      {r.preferredAt ? (
        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          Khung giờ:{" "}
          {new Date(r.preferredAt).toLocaleString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      {!isEducation && (r.deliveryBuilding || r.deliveryApartment) ? (
        <p style={{ margin: "0 0 6px", fontSize: 14 }}>
          {r.deliveryBuilding}-{r.deliveryApartment}
        </p>
      ) : null}
      {r.customerNote ? (
        <p className="stat" style={{ marginBottom: 8 }}>
          {r.customerNote}
        </p>
      ) : null}
      {r.contacts?.customer.phone && r.status === "OPEN" ? (
        <div style={{ margin: "8px 0" }}>
          <ServiceRequestZaloContact
            role="provider"
            education={isEducation}
            sports={providerType === "SPORTS_FACILITY"}
            contacts={r.contacts}
          />
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {r.status === "OPEN" ? (
          <>
            <button
              type="button"
              className="btn provider-btn"
              style={{ width: "auto", padding: "8px 12px" }}
              disabled={busy}
              onClick={() => onAction(r.id, "accept")}
            >
              {isEducation ? "Xác nhận" : providerType === "SPORTS_FACILITY" ? "Giữ chỗ" : "Nhận"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: "auto", padding: "8px 12px" }}
              disabled={busy}
              onClick={() => onRejectOpen(r.id)}
            >
              Từ chối
            </button>
          </>
        ) : null}
        {r.status === "CONFIRMED" && !isEducation ? (
          <button
            type="button"
            className="btn provider-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            disabled={busy}
            onClick={() => onAction(r.id, "start")}
          >
            Bắt đầu
          </button>
        ) : null}
        {r.status === "UPCOMING" ? (
          <button
            type="button"
            className="btn provider-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            disabled={busy}
            onClick={() => onAction(r.id, "start")}
          >
            Bắt đầu buổi học
          </button>
        ) : null}
        {r.status === "IN_PROGRESS" ? (
          <button
            type="button"
            className="btn provider-btn"
            style={{ width: "auto", padding: "8px 12px" }}
            disabled={busy}
            onClick={() => onAction(r.id, "complete")}
          >
            Hoàn thành
          </button>
        ) : null}
      </div>
      {isEducation && r.status === "CONFIRMED" ? (
        <TrialScheduleForm requestId={r.id} busy={busy} onSubmit={onScheduleTrial} />
      ) : null}
      {rejectId === r.id ? (
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={rejectNote}
            placeholder="Lý do từ chối…"
            onChange={(e) => onRejectNote(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: 8 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: "auto" }}
            disabled={busy || !rejectNote.trim()}
            onClick={() => onAction(r.id, "reject", rejectNote.trim())}
          >
            Xác nhận từ chối
          </button>
        </div>
      ) : null}
    </article>
  );
}

export default function ProviderRequestsPage() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");
  const { locationId, activeLocation } = useProviderLocation();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ requests: ServiceRequest[] }>(
      `/provider/service-requests?locationId=${locationId}`,
    );
    setRequests(res.requests);
  }, [locationId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!focusId) return;
    const el = document.getElementById(`service-request-${focusId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId, requests.length]);

  async function action(
    id: string,
    actionName: "accept" | "reject" | "start" | "complete",
    note?: string,
  ) {
    setBusyId(id);
    try {
      await api(`/provider/service-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: actionName, note }),
      });
      setRejectId(null);
      setRejectNote("");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function scheduleTrial(id: string, draft: TrialDraft) {
    setBusyId(id);
    try {
      await api(`/provider/service-requests/${id}/trial-schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduledAt: new Date(draft.scheduledAt).toISOString(),
          locationType: draft.locationType,
          offlineAddress:
            draft.locationType === "OFFLINE" ? draft.offlineAddress.trim() : undefined,
          onlinePlatform:
            draft.locationType === "ONLINE" ? draft.onlinePlatform : undefined,
          onlineDetail:
            draft.locationType === "ONLINE" && draft.onlinePlatform === "OTHER"
              ? draft.onlineDetail.trim()
              : undefined,
          teacherName: draft.teacherName.trim(),
        }),
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const active = requests.filter(
    (r) => !["COMPLETED", "CANCELLED", "PROVIDER_REJECTED"].includes(r.status),
  );
  const isEducation = isEducationVertical(activeLocation?.providerType);
  const isPet = activeLocation?.providerType === "PET_SERVICE";
  const isSports = isSportsVertical(activeLocation?.providerType);
  const supportsRequests =
    activeLocation?.providerType === "HOME_SERVICE" || isEducation || isPet || isSports;

  const pendingOpen = active.filter((r) => r.status === "OPEN");
  const needSchedule = isEducation ? active.filter((r) => r.status === "CONFIRMED") : [];
  const waitingList = isEducation ? active.filter((r) => r.status === "UPCOMING") : [];
  const inProgress = active.filter((r) =>
    ["CONFIRMED", "UPCOMING", "IN_PROGRESS"].includes(r.status) &&
    !(isEducation && (r.status === "CONFIRMED" || r.status === "UPCOMING")),
  );

  const cardProps = {
    isEducation,
    providerType: activeLocation?.providerType,
    focusId,
    rejectId,
    rejectNote,
    onRejectNote: setRejectNote,
    onRejectOpen: setRejectId,
    onAction: action,
    onScheduleTrial: scheduleTrial,
  };

  return (
    <ProviderPageShell
      title={
        isEducation
          ? "Buổi học thử"
          : isSports
            ? "Đặt sân"
            : isPet
              ? "Trông pet / dắt chó"
              : "Yêu cầu dịch vụ"
      }
    >
      {!supportsRequests ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            Tab này dành cho dịch vụ nhà, giáo dục và đặt sân.
          </p>
        </div>
      ) : active.length === 0 ? (
        <div className="card">
          <p className="stat" style={{ margin: 0 }}>
            {isEducation
              ? "Chưa có đăng ký buổi học thử."
              : isSports
                ? "Chưa có yêu cầu đặt sân."
                : "Chưa có yêu cầu mới."}
          </p>
        </div>
      ) : (
        <>
          {pendingOpen.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <p className="section-title">Đăng ký mới ({pendingOpen.length})</p>
              <div className="provider-list">
                {pendingOpen.map((r) => (
                  <RequestCard key={r.id} r={r} busy={busyId === r.id} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
          {needSchedule.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <p className="section-title">Chờ sắp lịch ({needSchedule.length})</p>
              <div className="provider-list">
                {needSchedule.map((r) => (
                  <RequestCard key={r.id} r={r} busy={busyId === r.id} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
          {waitingList.length > 0 ? (
            <div style={{ marginBottom: 16 }}>
              <p className="section-title">Đơn chờ ({waitingList.length})</p>
              <div className="provider-list">
                {waitingList.map((r) => (
                  <RequestCard key={r.id} r={r} busy={busyId === r.id} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
          {inProgress.length > 0 ? (
            <div>
              <p className="section-title">
                {isEducation ? "Đang diễn ra" : "Đang xử lý"} ({inProgress.length})
              </p>
              <div className="provider-list">
                {inProgress.map((r) => (
                  <RequestCard key={r.id} r={r} busy={busyId === r.id} {...cardProps} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </ProviderPageShell>
  );
}
