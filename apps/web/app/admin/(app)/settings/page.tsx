"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPageShell, canSeeCityContent, useAdminSession } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";
import { compressImageFile } from "../../../../lib/compress-image";

const WINDOWS = [
  { id: "family-dinner", label: "Bữa tối ấm cúng" },
  { id: "breakfast-morning", label: "Ăn sáng" },
  { id: "lunch", label: "Bữa trưa" },
  { id: "breakfast-preorder", label: "Sáng mai ăn gì" },
  { id: "overnight", label: "Khuya" },
] as const;

type HeroImage = {
  id: string;
  contextId: string;
  imageUrl: string;
  sortOrder: number;
};

type DraftSlot =
  | { key: string; kind: "saved"; id: string; preview: string }
  | { key: string; kind: "new"; preview: string; dataUrl: string };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}

export default function AdminSettingsPage() {
  const router = useRouter();
  const { session } = useAdminSession();
  const [contextId, setContextId] = useState<(typeof WINDOWS)[number]["id"]>("family-dinner");
  const [images, setImages] = useState<HeroImage[]>([]);
  const [draft, setDraft] = useState<DraftSlot[]>([]);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const res = await api<{ images: HeroImage[] }>("/admin/home-hero");
    setImages(res.images);
  }

  useEffect(() => {
    if (!session) return;
    if (!canSeeCityContent(session)) {
      if (session.zones.length === 1) router.replace(`/admin/zones/${session.zones[0]!.slug}/settings`);
      else router.replace("/admin");
      return;
    }
    void reload().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Không tải được ảnh banner");
    });
  }, [router, session]);

  const saved = images.filter((image) => image.contextId === contextId);
  const shown = editing ? draft : saved.map((image) => ({ key: image.id, preview: image.imageUrl }));

  function beginEdit() {
    setDraft(
      saved.map((image) => ({
        key: image.id,
        kind: "saved" as const,
        id: image.id,
        preview: image.imageUrl,
      })),
    );
    setEditing(true);
    setError(null);
    setNotice(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft([]);
    setError(null);
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/admin/login");
  }

  async function readPhoto(file: File | undefined): Promise<{ preview: string; dataUrl: string } | null> {
    if (!file) return null;
    const blob = await compressImageFile(file);
    const dataUrl = await blobToDataUrl(blob);
    return { preview: dataUrl, dataUrl };
  }

  async function addFile(file: File | undefined) {
    if (!file || draft.length >= 5) return;
    setError(null);
    setBusy(true);
    try {
      const photo = await readPhoto(file);
      if (!photo) return;
      setDraft((prev) => [
        ...prev,
        { key: crypto.randomUUID(), kind: "new", preview: photo.preview, dataUrl: photo.dataUrl },
      ]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không đọc được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function replaceFile(key: string, file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const photo = await readPhoto(file);
      if (!photo) return;
      setDraft((prev) =>
        prev.map((slot) =>
          slot.key === key
            ? { key, kind: "new", preview: photo.preview, dataUrl: photo.dataUrl }
            : slot,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không đọc được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api("/admin/home-hero", {
        method: "PUT",
        body: JSON.stringify({
          contextId,
          slots: draft.map((slot) =>
            slot.kind === "saved" ? { id: slot.id } : { dataUrl: slot.dataUrl },
          ),
        }),
      });
      await reload();
      setEditing(false);
      setDraft([]);
      setNotice("Đã khóa lên trang chủ");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không lưu được ảnh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminPageShell title="Banner Hà Nội">
      <div className="card" style={{ marginBottom: 12 }}>
        <p className="section-title">Ảnh banner trang chủ</p>
        <p className="muted" style={{ marginTop: 0 }}>
          Banner dùng chung cho Hà Nội. Mỗi khung giờ tối đa 5 ảnh, trang chủ đổi ảnh mỗi 6 giây.
          Đây không phải cài đặt hệ thống và không phải cài đặt khu vực.
        </p>
        <label className="field">
          Khung giờ
          <select
            value={contextId}
            disabled={editing}
            onChange={(event) => {
              setContextId(event.target.value as (typeof WINDOWS)[number]["id"]);
              setNotice(null);
            }}
          >
            {WINDOWS.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {shown.length}/5 ảnh
          {editing ? " · đang chỉnh, bấm Lưu để khóa lên trang chủ" : " · đang khóa trên trang chủ"}
        </p>
        {shown.length === 0 ? <p className="muted">Chưa có ảnh cho khung giờ này.</p> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {editing
            ? draft.map((slot) => (
                <div key={slot.key} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%" }}>
                  <img
                    src={slot.preview}
                    alt=""
                    style={{ width: 88, height: 88, objectFit: "cover", borderRadius: 12, flex: "0 0 auto" }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <label className="btn btn-secondary" style={{ width: "auto" }}>
                      Chỉnh sửa
                      <input
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        style={{ display: "none" }}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          void replaceFile(slot.key, file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: "auto" }}
                      disabled={busy}
                      onClick={() => setDraft((prev) => prev.filter((item) => item.key !== slot.key))}
                    >
                      Gỡ
                    </button>
                  </div>
                </div>
              ))
            : saved.map((image) => (
                <img
                  key={image.id}
                  src={image.imageUrl}
                  alt=""
                  style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 12 }}
                />
              ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {editing ? (
            <>
              <label className="btn btn-secondary" style={{ width: "auto" }}>
                {draft.length >= 5 ? "Đã đủ 5 ảnh" : "Thêm ảnh"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy || draft.length >= 5}
                  style={{ display: "none" }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    void addFile(file);
                  }}
                />
              </label>
              <button type="button" className="btn" style={{ width: "auto" }} disabled={busy} onClick={() => void save()}>
                {busy ? "Đang lưu…" : "Lưu"}
              </button>
              <button type="button" className="btn btn-secondary" style={{ width: "auto" }} disabled={busy} onClick={cancelEdit}>
                Hủy
              </button>
            </>
          ) : (
            <button type="button" className="btn" style={{ width: "auto" }} onClick={beginEdit}>
              Chỉnh sửa
            </button>
          )}
        </div>
        {notice ? <p className="muted">{notice}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="card">
        <p className="section-title">Apps</p>
        <Link href="/" className="stat" style={{ display: "block", marginBottom: 8 }}>
          Customer →
        </Link>
        <Link href="/provider/login" className="stat" style={{ display: "block", marginBottom: 8 }}>
          Provider →
        </Link>
        <Link href="/runner/login" className="stat" style={{ display: "block", marginBottom: 12 }}>
          Runner →
        </Link>
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
          Đăng xuất
        </button>
      </div>
    </AdminPageShell>
  );
}
