"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
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
    sameBuildingBaseFee: number;
    buildingToBuildingBaseFee: number;
    groundToBuildingBaseFee: number;
    buildingToGroundBaseFee: number;
    groundToGroundBaseFee: number;
    minimumRunnerPayable: number;
    hotFoodSurcharge: number;
    heavySurcharge: number;
    bulkySurcharge: number;
    batchExtraOrderFee: number;
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
      <p className="stat">
        Giá runner theo loại chuyến của khu này. Banner và trải nghiệm thuộc thành phố, không sửa ở khu.
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {notice ? <p style={{ color: "#166534" }}>{notice}</p> : null}
      {form ? (
        <div className="card">
          <label className="field">
            Ghi chú vận hành
            <textarea value={form.notes} disabled={!canEdit} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          </label>
          <h2>Giao hàng</h2>
          <p className="stat">Tiền runner = giá loại chuyến + phụ phí tòa + phụ phí hàng. Khách, quán và Pickee chia khoản này theo ưu đãi đang có.</p>
          <Fee label="Cùng tòa" value={form.fulfillment.sameBuildingBaseFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "sameBuildingBaseFee", value)} />
          <Fee label="Tòa sang tòa" value={form.fulfillment.buildingToBuildingBaseFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "buildingToBuildingBaseFee", value)} />
          <Fee label="Mặt đất lên tòa" value={form.fulfillment.groundToBuildingBaseFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "groundToBuildingBaseFee", value)} />
          <Fee label="Tòa xuống mặt đất" value={form.fulfillment.buildingToGroundBaseFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "buildingToGroundBaseFee", value)} />
          <Fee label="Mặt đất sang mặt đất" value={form.fulfillment.groundToGroundBaseFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "groundToGroundBaseFee", value)} />
          <Fee label="Tối thiểu trả runner" value={form.fulfillment.minimumRunnerPayable} disabled={!canEdit} onChange={(value) => patchFee(setForm, "minimumRunnerPayable", value)} />
          <Fee label="Đồ nóng" value={form.fulfillment.hotFoodSurcharge} disabled={!canEdit} onChange={(value) => patchFee(setForm, "hotFoodSurcharge", value)} />
          <Fee label="Hàng nặng" value={form.fulfillment.heavySurcharge} disabled={!canEdit} onChange={(value) => patchFee(setForm, "heavySurcharge", value)} />
          <Fee label="Hàng cồng kềnh" value={form.fulfillment.bulkySurcharge} disabled={!canEdit} onChange={(value) => patchFee(setForm, "bulkySurcharge", value)} />
          <h2>Khi chưa rõ loại chuyến</h2>
          <Fee label="Phí giao đồ ăn" value={form.fulfillment.foodDeliveryFeeVnd} disabled={!canEdit} onChange={(value) => patchFee(setForm, "foodDeliveryFeeVnd", value)} />
          <Fee label="Phí giao tận cửa" value={form.fulfillment.foodDoorDeliveryFeeVnd} disabled={!canEdit} onChange={(value) => patchFee(setForm, "foodDoorDeliveryFeeVnd", value)} />
          <Fee label="Phí runner giặt là" value={form.fulfillment.laundryReturnRunnerFeeVnd} disabled={!canEdit} onChange={(value) => patchFee(setForm, "laundryReturnRunnerFeeVnd", value)} />
          <h2>Đơn ghép</h2>
          <Fee label="Phút chờ ghép" value={form.fulfillment.batchWaitWindowMinutes} disabled={!canEdit} onChange={(value) => patchFee(setForm, "batchWaitWindowMinutes", value)} />
          <Fee label="Số đơn tối đa" value={form.fulfillment.maxBatchOrders} disabled={!canEdit} onChange={(value) => patchFee(setForm, "maxBatchOrders", value)} />
          <Fee label="Phụ phí mỗi đơn thêm" value={form.fulfillment.batchExtraOrderFee} disabled={!canEdit} onChange={(value) => patchFee(setForm, "batchExtraOrderFee", value)} />
          <Fee label="Lệch đường tối đa (m)" value={form.fulfillment.maxRouteDetourMeters} disabled={!canEdit} onChange={(value) => patchFee(setForm, "maxRouteDetourMeters", value)} />
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

function patchFee(
  setForm: Dispatch<SetStateAction<Settings | null>>,
  key: keyof Settings["fulfillment"],
  value: number,
) {
  setForm((current) => (current ? { ...current, fulfillment: { ...current.fulfillment, [key]: value } } : current));
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
