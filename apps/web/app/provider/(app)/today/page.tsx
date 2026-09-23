"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ClassifiedPhotoPicker,
  type ClassifiedPhoto,
} from "../../../components/classified-photo-picker";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";

const UPDATE_TYPES = [
  { value: "TODAY_AVAILABLE", label: "Hôm nay có" },
  { value: "DAILY_SPECIAL", label: "Món đặc biệt" },
  { value: "NEW_ITEM", label: "Món / dịch vụ mới" },
  { value: "OPEN_SLOT", label: "Còn slot" },
  { value: "LOW_STOCK", label: "Sắp hết" },
  { value: "LATE_DINNER", label: "Bữa tối muộn" },
  { value: "PROMOTION", label: "Ưu đãi" },
  { value: "NEW_SERVICE", label: "Dịch vụ mới" },
] as const;

type DailyUpdate = {
  id: string;
  updateType: string;
  title: string;
  description: string | null;
  imageUrls: string[];
  expiresAt: string;
  status: string;
  createdAt: string;
};

function typeLabel(t: string): string {
  return UPDATE_TYPES.find((x) => x.value === t)?.label ?? t;
}

function statusLabel(s: string): string {
  if (s === "ACTIVE") return "Đang hiện";
  if (s === "EXPIRED") return "Hết hạn";
  if (s === "HIDDEN") return "Đã ẩn (sửa để hiện lại)";
  return s;
}

export default function ProviderTodayPage() {
  const { locationId } = useProviderLocation();
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [updateType, setUpdateType] = useState<string>("TODAY_AVAILABLE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<ClassifiedPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ updates: DailyUpdate[] }>(`/provider/locations/${locationId}/today`);
    setUpdates(res.updates);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => {
      setError(e instanceof Error ? e.message : "Không tải được");
    });
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setUpdateType("TODAY_AVAILABLE");
    setTitle("");
    setDescription("");
    setPhotos([]);
  }

  function startEdit(u: DailyUpdate) {
    setEditingId(u.id);
    setUpdateType(u.updateType);
    setTitle(u.title);
    setDescription(u.description ?? "");
    setPhotos(
      (u.imageUrls ?? []).map((url) => ({
        url,
        previewUrl: url,
        sizeLabel: "",
      })),
    );
    setToast(null);
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    if (!locationId || !title.trim()) {
      setError("Nhập tiêu đề ngắn");
      return;
    }
    setBusy(true);
    setError(null);
    setToast(null);
    const imageUrls = photos.map((p) => p.url);
    try {
      if (editingId) {
        await api(`/provider/locations/${locationId}/today/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            updateType,
            title: title.trim(),
            description: description.trim() || null,
            imageUrls,
          }),
        });
        setToast("Đã cập nhật bài");
      } else {
        await api(`/provider/locations/${locationId}/today`, {
          method: "POST",
          body: JSON.stringify({
            updateType,
            title: title.trim(),
            description: description.trim() || undefined,
            imageUrls: imageUrls.length ? imageUrls : undefined,
          }),
        });
        setToast("Đã đăng — hiện trên Home khách đến hết ngày (VN)");
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!locationId) return;
    if (!window.confirm("Xóa bài này? Khách sẽ không còn thấy trên Home.")) return;
    setBusy(true);
    try {
      await api(`/provider/locations/${locationId}/today/${id}`, { method: "DELETE" });
      if (editingId === id) resetForm();
      await load();
      setToast("Đã xóa bài");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xóa được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Hôm nay có">
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="section-title">{editingId ? "Sửa bài" : "Đăng nhanh"}</p>
        <p className="stat" style={{ marginTop: 0 }}>
          Hiện trên Home khách trong Zone đến hết ngày. Không dùng điểm / coin.
        </p>
        <label className="field">
          <span>Loại</span>
          <select value={updateType} onChange={(e) => setUpdateType(e.target.value)}>
            {UPDATE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tiêu đề</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="VD: Còn 8 suất cơm tối"
          />
        </label>
        <label className="field">
          <span>Mô tả (tuỳ chọn)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Mô tả ngắn — nguyên liệu, số suất, giờ bán…"
            style={{ width: "100%", resize: "vertical", minHeight: 96 }}
          />
        </label>
        <div className="field">
          <ClassifiedPhotoPicker photos={photos} onChange={setPhotos} disabled={busy} maxPhotos={3} />
        </div>
        {error ? <p className="error">{error}</p> : null}
        {toast ? <p className="stat">{toast}</p> : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
            {busy ? "Đang lưu…" : editingId ? "Lưu sửa" : "Đăng hôm nay"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => resetForm()}
            >
              Hủy sửa
            </button>
          ) : null}
        </div>
      </div>

      <div className="card">
        <p className="section-title">Bài đã đăng</p>
        {updates.length === 0 ? (
          <p className="stat" style={{ margin: 0 }}>
            Chưa có bài nào.
          </p>
        ) : (
          <ul className="familiar-list">
            {updates.map((u) => (
              <li key={u.id} className="familiar-row" style={{ flexWrap: "wrap" }}>
                <div className="familiar-row-main" style={{ flex: "1 1 160px" }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>{u.title}</p>
                  {u.description ? (
                    <p className="stat" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
                      {u.description}
                    </p>
                  ) : null}
                  {u.imageUrls?.length ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {u.imageUrls.map((src) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={src}
                          src={src}
                          alt=""
                          style={{
                            width: 56,
                            height: 56,
                            objectFit: "cover",
                            borderRadius: 8,
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                  <p className="stat" style={{ margin: "6px 0 0" }}>
                    {typeLabel(u.updateType)} · {statusLabel(u.status)}
                    {u.status === "ACTIVE"
                      ? ` · hết ${new Date(u.expiresAt).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => startEdit(u)}
                  >
                    Sửa
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={busy}
                    onClick={() => void remove(u.id)}
                  >
                    Xóa
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ProviderPageShell>
  );
}
