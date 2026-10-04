"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../../components/admin-session-context";
import { api } from "../../../../../lib/api";
import { compressImageFile } from "../../../../../lib/compress-image";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  formatOccurrence,
  ictInputToIso,
  ictInputValue,
  type ExperienceCard,
} from "../../../../../lib/experiences";

type OrganizerMember = { userId: string; phone: string | null };

type AdminExperience = ExperienceCard & {
  sources: { sourceUrl: string; sourceName: string; sourceType: string }[];
  organizerMembers?: OrganizerMember[];
};

export default function AdminExperienceReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<AdminExperience | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<AdminExperience>(`/admin/experiences/${params.id}`).then(setRow);
  }, [params.id]);

  async function save(): Promise<AdminExperience | null> {
    if (!row) return null;
    setBusy(true);
    setMessage(null);
    try {
      const next = await api<AdminExperience>(`/admin/experiences/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: row.title,
          summary: row.summary,
          whyGo: row.whyGo,
          body: row.body,
          priceMode: row.priceMode,
          priceFrom: row.priceMode === "PRICED" ? row.priceFromVnd : null,
          priceTo: row.priceMode === "PRICED" ? row.priceToVnd : null,
          priceNote: row.priceNote,
          categories: row.categories,
          audiences: row.audiences,
          bookingUrl: row.bookingUrl,
          coverUrl: row.coverUrl,
          mediaStatus: row.mediaStatus,
          soldOut: row.soldOut,
          featuredRank: row.featuredRank,
          ageNote: row.ageNote,
          language: row.language,
          durationMinutes: row.durationMinutes,
          bookingDeadline: row.bookingDeadline ?? null,
          registrationDeadline: row.registrationDeadline ?? null,
          organizerName: row.organizer.name,
          venueName: row.venue.name,
          venueAddress: row.venue.address,
          venueLat: row.venue.lat ?? null,
          venueLng: row.venue.lng ?? null,
          occurrences: row.occurrences.map((item) => ({
            startAt: item.startAt,
            endAt: item.endAt,
          })),
        }),
      });
      setRow(next);
      setMessage("Đã lưu draft.");
      return next;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không lưu được");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!row) return;
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try {
      const next = await api<AdminExperience>(`/admin/experiences/${saved.id}/publish`, { method: "POST" });
      setRow(next);
      setMessage("Đã xuất bản.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không xuất bản được");
    } finally {
      setBusy(false);
    }
  }

  async function removeRejected() {
    if (!row) return;
    if (!window.confirm(`Xóa “${row.title}” khỏi danh sách? Tổ chức không còn thấy bài này.`)) return;
    setBusy(true);
    try {
      await api(`/admin/experiences/${row.id}`, { method: "DELETE" });
      router.replace("/admin/experiences");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không xóa được");
      setBusy(false);
    }
  }

  async function reject() {
    if (!row) return;
    setBusy(true);
    try {
      const next = await api<AdminExperience>(`/admin/experiences/${row.id}/reject`, { method: "POST" });
      setRow(next);
      setMessage("Đã từ chối.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không từ chối được");
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover(file: File | null) {
    if (!file || !row) return;
    setBusy(true);
    setMessage(null);
    try {
      const blob = await compressImageFile(file);
      const dataUrl = await blobToDataUrl(blob);
      const uploaded = await api<{ url: string }>("/admin/experiences/photos", {
        method: "POST",
        body: JSON.stringify({ dataUrl }),
      });
      setRow({ ...row, coverUrl: uploaded.url, mediaStatus: "READY" });
      setMessage("Đã tải ảnh. Bấm lưu để giữ.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không tải được ảnh");
    } finally {
      setBusy(false);
    }
  }

  if (!row) {
    return (
      <AdminPageShell title="Trải nghiệm">
        <p className="stat">Đang tải…</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title={row.title}>
      <p className="stat">
        <Link href="/admin/experiences">← Danh sách</Link> · {row.status}
      </p>
      <p className="stat">
        featured_rank là độ ưu tiên biên tập. Home vẫn tự chọn suất PUBLISHED đúng khung thời gian.
      </p>
      <div className="field">
        <label>Tiêu đề</label>
        <input value={row.title} onChange={(event) => setRow({ ...row, title: event.target.value })} />
      </div>
      <div className="field">
        <label>Tóm tắt</label>
        <textarea rows={3} value={row.summary} onChange={(event) => setRow({ ...row, summary: event.target.value })} />
      </div>
      <div className="field">
        <label>Vì sao đáng đi</label>
        <textarea rows={3} value={row.whyGo} onChange={(event) => setRow({ ...row, whyGo: event.target.value })} />
      </div>
      <div className="field">
        <label>Bài viết</label>
        <textarea rows={6} value={row.body ?? ""} onChange={(event) => setRow({ ...row, body: event.target.value })} />
      </div>
      <div className="field">
        <label>Giá</label>
        <select
          value={row.priceMode}
          onChange={(event) =>
            setRow({
              ...row,
              priceMode: event.target.value as ExperienceCard["priceMode"],
              priceFromVnd: event.target.value === "PRICED" ? row.priceFromVnd : null,
              priceToVnd: event.target.value === "PRICED" ? row.priceToVnd : null,
            })
          }
        >
          <option value="FREE">Miễn phí</option>
          <option value="PRICED">Có giá</option>
          <option value="UNKNOWN">Chưa rõ</option>
        </select>
      </div>
      {row.priceMode === "PRICED" ? (
        <>
          <div className="field">
            <label>Giá từ</label>
            <input
              inputMode="numeric"
              value={row.priceFromVnd ?? ""}
              onChange={(event) =>
                setRow({ ...row, priceFromVnd: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </div>
          <div className="field">
            <label>Giá đến</label>
            <input
              inputMode="numeric"
              value={row.priceToVnd ?? ""}
              onChange={(event) =>
                setRow({ ...row, priceToVnd: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
          </div>
        </>
      ) : null}
      <div className="field">
        <label>Ghi chú giá</label>
        <input
          value={row.priceNote ?? ""}
          placeholder="Phần miễn phí ghi ở đây khi sự kiện vẫn có vé"
          onChange={(event) => setRow({ ...row, priceNote: event.target.value || null })}
        />
      </div>
      <label className="stat">
        <input
          type="checkbox"
          checked={row.soldOut}
          onChange={(event) => setRow({ ...row, soldOut: event.target.checked })}
        />{" "}
        Hết vé
      </label>
      <div className="field">
        <label>Thời lượng (phút)</label>
        <input
          inputMode="numeric"
          value={row.durationMinutes ?? ""}
          onChange={(event) =>
            setRow({
              ...row,
              durationMinutes: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      </div>
      <div className="field">
        <label>Độ tuổi</label>
        <input
          value={row.ageNote ?? ""}
          onChange={(event) => setRow({ ...row, ageNote: event.target.value || null })}
        />
      </div>
      <div className="field">
        <label>Ngôn ngữ</label>
        <input
          value={row.language ?? ""}
          onChange={(event) => setRow({ ...row, language: event.target.value || null })}
        />
      </div>
      <div className="field">
        <label>Đơn vị tổ chức</label>
        <input
          value={row.organizer.name}
          onChange={(event) => setRow({ ...row, organizer: { ...row.organizer, name: event.target.value } })}
        />
      </div>
      <div className="field">
        <label>Địa điểm</label>
        <input
          value={row.venue.name}
          onChange={(event) => setRow({ ...row, venue: { ...row.venue, name: event.target.value } })}
        />
      </div>
      <div className="field">
        <label>Vĩ độ</label>
        <input
          inputMode="decimal"
          value={row.venue.lat ?? ""}
          onChange={(event) =>
            setRow({
              ...row,
              venue: {
                ...row.venue,
                lat: event.target.value === "" ? null : Number(event.target.value),
              },
            })
          }
        />
      </div>
      <div className="field">
        <label>Kinh độ</label>
        <input
          inputMode="decimal"
          value={row.venue.lng ?? ""}
          onChange={(event) =>
            setRow({
              ...row,
              venue: {
                ...row.venue,
                lng: event.target.value === "" ? null : Number(event.target.value),
              },
            })
          }
        />
      </div>
      <div className="field">
        <label>Địa chỉ</label>
        <input
          value={row.venue.address ?? ""}
          onChange={(event) => setRow({ ...row, venue: { ...row.venue, address: event.target.value || null } })}
        />
      </div>
      {row.occurrences.map((item, index) => (
        <div className="field" key={index}>
          <label>Suất {index + 1}</label>
          <input
            type="datetime-local"
            value={ictInputValue(item.startAt)}
            onChange={(event) => {
              const startAt = ictInputToIso(event.target.value);
              if (!startAt) return;
              const occurrences = row.occurrences.map((occurrence, occurrenceIndex) =>
                occurrenceIndex === index ? { ...occurrence, startAt } : occurrence,
              );
              setRow({ ...row, occurrences });
            }}
          />
        </div>
      ))}
      <div className="field">
        <label>Hạn đặt chỗ</label>
        <input
          type="datetime-local"
          value={ictInputValue(row.bookingDeadline)}
          onChange={(event) => setRow({ ...row, bookingDeadline: ictInputToIso(event.target.value) })}
        />
      </div>
      <div className="field">
        <label>Hạn đăng ký</label>
        <input
          type="datetime-local"
          value={ictInputValue(row.registrationDeadline)}
          onChange={(event) =>
            setRow({ ...row, registrationDeadline: ictInputToIso(event.target.value) })
          }
        />
      </div>
      <div className="field">
        <label>Ưu tiên biên tập</label>
        <input
          inputMode="numeric"
          value={row.featuredRank ?? ""}
          placeholder="Để trống nếu không ưu tiên"
          onChange={(event) =>
            setRow({
              ...row,
              featuredRank: event.target.value === "" ? null : Number(event.target.value),
            })
          }
        />
      </div>
      <div className="field">
        <label>Ảnh</label>
        <select
          value={row.mediaStatus}
          onChange={(event) => setRow({ ...row, mediaStatus: event.target.value })}
        >
          <option value="PLACEHOLDER">Placeholder</option>
          <option value="NEEDS_REVIEW">Cần xem quyền ảnh</option>
          <option value="READY">Được phép hiện</option>
        </select>
      </div>
      <div className="field">
        <label>Cover URL</label>
        <input
          value={row.coverUrl ?? ""}
          onChange={(event) => setRow({ ...row, coverUrl: event.target.value || null })}
        />
      </div>
      <div className="field">
        <label htmlFor="experience-cover">Tải ảnh bìa</label>
        <input
          id="experience-cover"
          type="file"
          accept="image/*"
          onChange={(event) => void uploadCover(event.target.files?.[0] ?? null)}
        />
      </div>
      <div className="field">
        <label>Link đặt chỗ</label>
        <input
          value={row.bookingUrl ?? ""}
          onChange={(event) => setRow({ ...row, bookingUrl: event.target.value || null })}
        />
      </div>
      <p className="stat">
        {row.occurrences.map((item) => formatOccurrence(item.startAt)).join(" · ")}
      </p>
      <p className="stat">
        {row.organizer.name} · {row.venue.name}
        {row.venue.address ? ` · ${row.venue.address}` : ""}
      </p>
      {row.organizer.id ? (
        <OrganizerAccess
          organizerId={row.organizer.id}
          members={row.organizerMembers ?? []}
          onMembers={(members) => setRow({ ...row, organizerMembers: members })}
        />
      ) : null}
      <ul>
        {row.sources.map((source) => (
          <li key={source.sourceUrl}>
            {source.sourceUrl.includes("pickee.local/organizer-submit") ? (
              <span>Tự đăng · {source.sourceName}</span>
            ) : (
              <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                {source.sourceName}
              </a>
            )}{" "}
            · {source.sourceType}
          </li>
        ))}
      </ul>
      <p className="stat">{row.audiences.map((item) => AUDIENCE_LABELS[item] ?? item).join(" · ")}</p>
      <p className="stat">{row.categories.map((item) => CATEGORY_LABELS[item] ?? item).join(" · ")}</p>
      <div className="experience-import-actions">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void save()}>
          Lưu
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => void publish()}>
          Xuất bản
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void reject()}>
          Từ chối
        </button>
        {row.status === "REJECTED" ? (
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void removeRejected()}>
            Xóa
          </button>
        ) : null}
      </div>
      {message ? <p className="stat">{message}</p> : null}
    </AdminPageShell>
  );
}

function OrganizerAccess({
  organizerId,
  members,
  onMembers,
}: {
  organizerId: string;
  members: OrganizerMember[];
  onMembers: (members: OrganizerMember[]) => void;
}) {
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function attach() {
    setNote(null);
    try {
      const res = await api<{ members: OrganizerMember[] }>(
        `/admin/experiences/organizers/${organizerId}/members`,
        { method: "POST", body: JSON.stringify({ phone }) },
      );
      onMembers(res.members);
      setPhone("");
      setNote("Đã gắn tài khoản.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Không gắn được");
    }
  }

  return (
    <div className="card">
      <p className="stat">Người phụ trách</p>
      {members.length === 0 ? <p className="stat">Chưa gắn tài khoản.</p> : null}
      {members.map((member) => (
        <p key={member.userId} className="stat">
          {displayPhone(member.phone)}
        </p>
      ))}
      <div className="field">
        <label htmlFor="organizer-phone">Gắn số điện thoại</label>
        <input
          id="organizer-phone"
          inputMode="tel"
          value={phone}
          placeholder="090…"
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <button type="button" className="btn btn-secondary" disabled={phone.trim().length < 8} onClick={() => void attach()}>
        Gắn tài khoản
      </button>
      {note ? <p className="stat">{note}</p> : null}
    </div>
  );
}

function displayPhone(phone: string | null): string {
  if (!phone) return "Đã gắn";
  if (phone.startsWith("+84")) return `0${phone.slice(3)}`;
  return phone;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}
