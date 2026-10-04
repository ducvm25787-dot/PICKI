"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell, useAdminSession } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type Settings = {
  zone: { slug: string; displayName: string };
  notes: string;
  fulfillment: {
    batchWaitWindowMinutes: number;
    maxBatchOrders: number;
    maxRouteDetourMeters: number;
    foodDeliveryFeeVnd: number;
    foodDoorDeliveryFeeVnd: number;
    laundryReturnRunnerFeeVnd: number;
  };
};

export default function ZoneSettingsPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const { session } = useAdminSession();
  const grant = session?.zones.find((zone) => zone.slug === slug)?.access;
  const canEdit = session?.superAdmin === true || grant === "admin";
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void api<Settings>(`/admin/zones/${slug}/settings`)
      .then(setForm)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được cài đặt"));
  }, [slug]);

  async function save() {
    if (!form) return;
    setError(null);
    setNotice(null);
    try {
      const next = await api<Settings>(`/admin/zones/${slug}/settings`, {
        method: "PUT",
        body: JSON.stringify({ notes: form.notes, ...form.fulfillment }),
      });
      setForm(next);
      setNotice("Đã lưu cấu hình khu vực");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không lưu được");
    }
  }

  return (
    <AdminPageShell title="Cài đặt khu vực">
      <p className="stat">Phí giao và ghi chú của khu vực này. Banner và trải nghiệm thuộc thành phố, không sửa ở khu.</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {notice ? <p style={{ color: "#166534" }}>{notice}</p> : null}
      {form ? (
        <div className="card">
          <label className="field">
            Ghi chú vận hành
            <textarea value={form.notes} disabled={!canEdit} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <Fee label="Phí giao đồ ăn" value={form.fulfillment.foodDeliveryFeeVnd} disabled={!canEdit} onChange={(value) => setForm({ ...form, fulfillment: { ...form.fulfillment, foodDeliveryFeeVnd: value } })} />
          <Fee label="Phí giao tận cửa" value={form.fulfillment.foodDoorDeliveryFeeVnd} disabled={!canEdit} onChange={(value) => setForm({ ...form, fulfillment: { ...form.fulfillment, foodDoorDeliveryFeeVnd: value } })} />
          <Fee label="Phí runner giặt là" value={form.fulfillment.laundryReturnRunnerFeeVnd} disabled={!canEdit} onChange={(value) => setForm({ ...form, fulfillment: { ...form.fulfillment, laundryReturnRunnerFeeVnd: value } })} />
          {canEdit ? (
            <button type="button" className="btn" onClick={() => void save()}>
              Lưu
            </button>
          ) : (
            <p className="stat">Chỉ Zone admin mới sửa cấu hình này.</p>
          )}
        </div>
      ) : null}
    </AdminPageShell>
  );
}

function Fee({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      {label}
      <input
        inputMode="numeric"
        disabled={disabled}
        value={String(value)}
        onChange={(event) => onChange(Number.parseInt(event.target.value || "0", 10) || 0)}
      />
    </label>
  );
}
