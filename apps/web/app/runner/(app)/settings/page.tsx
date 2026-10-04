"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RunnerPageShell } from "../../../components/runner-session-context";
import { api } from "../../../../lib/api";
import { compressImageFile } from "../../../../lib/compress-image";

export default function RunnerSettingsPage() {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [savingFace, setSavingFace] = useState(false);
  const [faceMessage, setFaceMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<{ displayName: string | null; avatarUrl: string | null }>("/me")
      .then((me) => {
        setName(me.displayName ?? "");
        setPreview(me.avatarUrl);
      })
      .catch(() => setFaceMessage("Không tải được hồ sơ"));
  }, []);

  useEffect(() => {
    void api<{ enabled: boolean }>("/notifications/push/vapid-key")
      .then((r) => setPushEnabled(r.enabled))
      .catch(() => setPushEnabled(false));
  }, []);

  async function testPush() {
    setTesting(true);
    setPushStatus(null);
    try {
      await api("/notifications/push/test", { method: "POST" });
      setPushStatus("Đã gửi — kiểm tra popup hệ thống (thu nhỏ tab rồi bấm lại).");
    } catch (e) {
      setPushStatus(e instanceof Error ? e.message : "Gửi thất bại");
    } finally {
      setTesting(false);
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/runner/login");
  }

  async function saveFace() {
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      setFaceMessage("Nhập tên hiển thị.");
      return;
    }
    setSavingFace(true);
    setFaceMessage(null);
    try {
      if (photo) {
        const blob = await compressImageFile(photo);
        const dataUrl = await blobToDataUrl(blob);
        const updated = await api<{ avatarUrl: string | null }>("/me/avatar", {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        });
        setPreview(updated.avatarUrl);
        setPhoto(null);
      }
      await api("/me", { method: "PATCH", body: JSON.stringify({ displayName: trimmed }) });
      setFaceMessage("Đã lưu ảnh chân dung và tên.");
    } catch (e) {
      setFaceMessage(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setSavingFace(false);
    }
  }

  return (
    <RunnerPageShell title="Cài đặt">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Ảnh chân dung</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Ops xem ảnh này trong danh sách tài xế. Chụp mặt rõ, nền sáng.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          {preview ? (
            <img
              src={preview}
              alt=""
              width={72}
              height={72}
              style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 36 }}
            />
          ) : (
            <span
              aria-hidden
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                background: "#e7eef2",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
              }}
            >
              {(name.trim() || "T").slice(0, 1).toUpperCase()}
            </span>
          )}
          <label className="btn btn-secondary" style={{ margin: 0, width: "auto" }}>
            Chọn ảnh
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPhoto(file);
                if (file) setPreview(URL.createObjectURL(file));
              }}
            />
          </label>
        </div>
        <div className="field">
          <label htmlFor="runner-display-name">Tên hiển thị</label>
          <input
            id="runner-display-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="button" className="btn runner-btn" disabled={savingFace} onClick={() => void saveFace()}>
          {savingFace ? "Đang lưu…" : "Lưu ảnh và tên"}
        </button>
        {faceMessage ? <p className="stat">{faceMessage}</p> : null}
      </div>
      <RunnerCredentials />
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Ứng dụng</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Cài Pickee Runner lên màn hình chính (Add to Home Screen) để mở nhanh khi giao hàng.
        </p>
        <p className="stat">Tab Đơn và Tiến trình tự làm mới mỗi 15 giây.</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">Thông báo nền</p>
        {pushEnabled === null ? (
          <p className="stat">Đang kiểm tra…</p>
        ) : pushEnabled ? (
          <>
            <p className="stat" style={{ marginTop: 0 }}>
              Web Push đã bật. Cho phép notification khi trình duyệt hỏi.
            </p>
            <button
              type="button"
              className="btn runner-btn"
              style={{ width: "auto", marginTop: 8 }}
              disabled={testing}
              onClick={() => void testPush()}
            >
              {testing ? "Đang gửi…" : "Gửi push thử"}
            </button>
            {pushStatus ? (
              <p className="stat" style={{ margin: "8px 0 0", fontSize: 14 }}>
                {pushStatus}
              </p>
            ) : null}
          </>
        ) : (
          <p className="stat" style={{ margin: 0 }}>
            Push chưa cấu hình — thêm VAPID_* vào .env và restart server.
          </p>
        )}
      </div>

      <div className="card">
        <p className="section-title">Khác</p>
        <Link href="/" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Customer app →
        </Link>
        <Link href="/provider/login" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Provider app →
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </RunnerPageShell>
  );
}

type Credentials = {
  cccdNumber: string | null;
  cccdFullName: string | null;
  hasCccdFront: boolean;
  hasCccdBack: boolean;
  vehiclePlate: string | null;
  hasVehicleDoc: boolean;
  payoutBankName: string | null;
  payoutAccountNumber: string | null;
  payoutAccountHolder: string | null;
};

function RunnerCredentials() {
  const [form, setForm] = useState({
    cccdNumber: "",
    cccdFullName: "",
    vehiclePlate: "",
    payoutBankName: "",
    payoutAccountNumber: "",
    payoutAccountHolder: "",
  });
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [vehicleDoc, setVehicleDoc] = useState<File | null>(null);
  const [previews, setPreviews] = useState<{ front: string | null; back: string | null; vehicle: string | null }>({
    front: null,
    back: null,
    vehicle: null,
  });
  const [has, setHas] = useState({ front: false, back: false, vehicle: false });
  const [saving, setSaving] = useState<"cccd" | "vehicle" | "payout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<Credentials>("/runner/credentials")
      .then(async (row) => {
        setForm({
          cccdNumber: row.cccdNumber ?? "",
          cccdFullName: row.cccdFullName ?? "",
          vehiclePlate: row.vehiclePlate ?? "",
          payoutBankName: row.payoutBankName ?? "",
          payoutAccountNumber: row.payoutAccountNumber ?? "",
          payoutAccountHolder: row.payoutAccountHolder ?? "",
        });
        setHas({ front: row.hasCccdFront, back: row.hasCccdBack, vehicle: row.hasVehicleDoc });
        const next = { front: null as string | null, back: null as string | null, vehicle: null as string | null };
        if (row.hasCccdFront) next.front = (await api<{ dataUrl: string }>("/runner/documents/cccd-front")).dataUrl;
        if (row.hasCccdBack) next.back = (await api<{ dataUrl: string }>("/runner/documents/cccd-back")).dataUrl;
        if (row.hasVehicleDoc) next.vehicle = (await api<{ dataUrl: string }>("/runner/documents/vehicle")).dataUrl;
        setPreviews(next);
      })
      .catch(() => setMessage("Không tải được hồ sơ giấy tờ"));
  }, []);

  async function saveCccd() {
    setSaving("cccd");
    setMessage(null);
    try {
      const body: Record<string, string> = {
        section: "cccd",
        cccdNumber: form.cccdNumber.trim(),
        cccdFullName: form.cccdFullName.trim(),
      };
      if (front) body.cccdFrontDataUrl = await fileToDataUrl(front);
      if (back) body.cccdBackDataUrl = await fileToDataUrl(back);
      const row = await api<Credentials>("/runner/credentials", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setHas((prev) => ({ ...prev, front: row.hasCccdFront, back: row.hasCccdBack }));
      setFront(null);
      setBack(null);
      setMessage("Đã lưu CCCD.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không lưu được CCCD");
    } finally {
      setSaving(null);
    }
  }

  async function saveVehicle() {
    setSaving("vehicle");
    setMessage(null);
    try {
      const body: Record<string, string> = {
        section: "vehicle",
        vehiclePlate: form.vehiclePlate.trim(),
      };
      if (vehicleDoc) body.vehicleDocDataUrl = await fileToDataUrl(vehicleDoc);
      const row = await api<Credentials>("/runner/credentials", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setHas((prev) => ({ ...prev, vehicle: row.hasVehicleDoc }));
      setVehicleDoc(null);
      setMessage("Đã lưu giấy tờ xe.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không lưu được giấy tờ xe");
    } finally {
      setSaving(null);
    }
  }

  async function savePayout() {
    setSaving("payout");
    setMessage(null);
    try {
      const row = await api<Credentials>("/runner/credentials", {
        method: "PATCH",
        body: JSON.stringify({
          section: "payout",
          payoutBankName: form.payoutBankName.trim(),
          payoutAccountNumber: form.payoutAccountNumber.trim(),
          payoutAccountHolder: form.payoutAccountHolder.trim(),
        }),
      });
      setForm((prev) => ({
        ...prev,
        payoutBankName: row.payoutBankName ?? "",
        payoutAccountNumber: row.payoutAccountNumber ?? "",
        payoutAccountHolder: row.payoutAccountHolder ?? "",
      }));
      setMessage("Đã lưu tài khoản nhận tiền. Pickee chưa chuyển khoản vào tài khoản này.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Không lưu được tài khoản");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <p className="section-title">Hồ sơ làm việc</p>
      <p className="stat" style={{ marginTop: 0 }}>
        CCCD bắt buộc vì tài xế giữ hàng và tiền. Giấy tờ xe và tài khoản nhận tiền lưu sẵn để lúc chạy thật gắn vào. Pickee chưa tự chuyển tiền.
      </p>
      <div className="field">
        <label htmlFor="cccd-number">Số CCCD</label>
        <input
          id="cccd-number"
          inputMode="numeric"
          value={form.cccdNumber}
          maxLength={12}
          onChange={(e) => setForm({ ...form, cccdNumber: e.target.value.replace(/\D/g, "").slice(0, 12) })}
        />
      </div>
      <div className="field">
        <label htmlFor="cccd-name">Họ tên trên CCCD</label>
        <input
          id="cccd-name"
          value={form.cccdFullName}
          maxLength={80}
          onChange={(e) => setForm({ ...form, cccdFullName: e.target.value })}
        />
      </div>
      <DocPicker
        label="CCCD mặt trước"
        preview={previews.front}
        onFile={(file) => {
          setFront(file);
          if (file) setPreviews((prev) => ({ ...prev, front: URL.createObjectURL(file) }));
        }}
      />
      <DocPicker
        label="CCCD mặt sau"
        preview={previews.back}
        onFile={(file) => {
          setBack(file);
          if (file) setPreviews((prev) => ({ ...prev, back: URL.createObjectURL(file) }));
        }}
      />
      <button type="button" className="btn runner-btn" disabled={saving !== null} onClick={() => void saveCccd()}>
        {saving === "cccd" ? "Đang lưu…" : has.front && has.back ? "Cập nhật CCCD" : "Lưu CCCD"}
      </button>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="vehicle-plate">Biển số xe</label>
        <input
          id="vehicle-plate"
          value={form.vehiclePlate}
          maxLength={20}
          onChange={(e) => setForm({ ...form, vehiclePlate: e.target.value })}
        />
      </div>
      <DocPicker
        label="Giấy đăng ký xe"
        preview={previews.vehicle}
        onFile={(file) => {
          setVehicleDoc(file);
          if (file) setPreviews((prev) => ({ ...prev, vehicle: URL.createObjectURL(file) }));
        }}
      />
      <button type="button" className="btn runner-btn" disabled={saving !== null} onClick={() => void saveVehicle()}>
        {saving === "vehicle" ? "Đang lưu…" : "Lưu giấy tờ xe"}
      </button>
      <div className="field" style={{ marginTop: 16 }}>
        <label htmlFor="bank-name">Ngân hàng</label>
        <input
          id="bank-name"
          value={form.payoutBankName}
          maxLength={80}
          onChange={(e) => setForm({ ...form, payoutBankName: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="bank-number">Số tài khoản</label>
        <input
          id="bank-number"
          inputMode="numeric"
          value={form.payoutAccountNumber}
          maxLength={20}
          onChange={(e) =>
            setForm({ ...form, payoutAccountNumber: e.target.value.replace(/\D/g, "").slice(0, 20) })
          }
        />
      </div>
      <div className="field">
        <label htmlFor="bank-holder">Chủ tài khoản</label>
        <input
          id="bank-holder"
          value={form.payoutAccountHolder}
          maxLength={80}
          onChange={(e) => setForm({ ...form, payoutAccountHolder: e.target.value })}
        />
      </div>
      <button type="button" className="btn runner-btn" disabled={saving !== null} onClick={() => void savePayout()}>
        {saving === "payout" ? "Đang lưu…" : "Lưu tài khoản nhận tiền"}
      </button>
      {message ? <p className="stat">{message}</p> : null}
    </div>
  );
}

function DocPicker({
  label,
  preview,
  onFile,
}: {
  label: string;
  preview: string | null;
  onFile: (file: File | null) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "8px 0 12px" }}>
      {preview ? (
        <img src={preview} alt="" width={72} height={48} style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 8 }} />
      ) : (
        <span className="stat" style={{ width: 72 }}>
          Chưa có
        </span>
      )}
      <label className="btn btn-secondary" style={{ margin: 0, width: "auto" }}>
        {label}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

async function fileToDataUrl(file: File) {
  const blob = await compressImageFile(file);
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}
