"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { api } from "../../../../lib/api";
import { compressImageFile } from "../../../../lib/compress-image";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  experienceApi,
  experienceHref,
  type ExperienceCard,
} from "../../../../lib/experiences";

type PriceMode = "FREE" | "PRICED" | "UNKNOWN";

export default function SubmitExperiencePage() {
  return (
    <Suspense fallback={<div className="container"><p className="tagline">Đang tải…</p></div>}>
      <SubmitExperienceForm />
    </Suspense>
  );
}

function SubmitExperienceForm() {
  const router = useRouter();
  const route = useParams<{ city: string }>();
  const search = useSearchParams();
  const editingId = search.get("id");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "paste">("write");
  const [organizerName, setOrganizerName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [whyGo, setWhyGo] = useState("");
  const [body, setBody] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [startAt, setStartAt] = useState("");
  const [priceMode, setPriceMode] = useState<PriceMode>("UNKNOWN");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [audiences, setAudiences] = useState<string[]>([]);
  const [bookingUrl, setBookingUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    void api<{ experiences: ExperienceCard[] }>(experienceApi(route.city, "/mine"))
      .then((res) => {
        const row = res.experiences.find((item) => item.id === editingId);
        if (!row) return;
        setOrganizerName(row.organizer.name);
        setWebsiteUrl(row.organizer.websiteUrl ?? "");
        setTitle(row.title);
        setSummary(row.summary);
        setWhyGo(row.whyGo);
        setBody(row.body ?? "");
        setVenueName(row.venue.name);
        setVenueAddress(row.venue.address ?? "");
        setStartAt(toLocalInput(row.occurrences[0]?.startAt));
        setPriceMode(row.priceMode);
        setPriceFrom(row.priceFromVnd != null ? String(row.priceFromVnd) : "");
        setPriceNote(row.priceNote ?? "");
        setCategories(row.categories);
        setAudiences(row.audiences);
        setBookingUrl(row.bookingUrl ?? "");
        setImageUrls(row.imageUrls ?? []);
      })
      .catch(() => router.replace("/login"));
  }, [editingId, route.city, router]);

  function wrap(prefix: string, suffix = prefix) {
    const el = bodyRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || "chữ";
    const next = `${body.slice(0, start)}${prefix}${selected}${suffix}${body.slice(end)}`;
    setBody(next);
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const el = bodyRef.current;
    if (!el) {
      setBody((current) => `${current}${text}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setBody(`${body.slice(0, start)}${text}${body.slice(end)}`);
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = [...imageUrls];
      for (const file of Array.from(files).slice(0, 6 - next.length)) {
        const blob = await compressImageFile(file);
        const dataUrl = await blobToDataUrl(blob);
        const uploaded = await api<{ url: string }>(experienceApi(route.city, "/photos"), {
          method: "POST",
          body: JSON.stringify({ dataUrl }),
        });
        next.push(uploaded.url);
      }
      setImageUrls(next);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không tải được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    setMessage(null);
    const payload = {
      organizerName,
      websiteUrl: websiteUrl || null,
      title,
      summary,
      whyGo,
      body,
      venueName,
      venueAddress: venueAddress || null,
      startAt: startAt ? new Date(startAt).toISOString() : "",
      priceMode,
      priceFrom: priceMode === "PRICED" && priceFrom ? Number(priceFrom) : null,
      priceTo: null,
      priceNote: priceNote || null,
      categories,
      audiences,
      bookingUrl: bookingUrl || null,
      imageUrls,
    };
    try {
      if (editingId) {
        await api(experienceApi(route.city, `/submissions/${editingId}`), {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api(experienceApi(route.city, "/submissions"), {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      router.push(experienceHref(route.city, "/mine"));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Không gửi được");
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle="Đăng trải nghiệm" />
      </div>
      <p className="stat">
        <Link href={experienceHref(route.city, "/mine")}>← Bài của tôi</Link>
      </p>
      <p className="stat">Bài vào hàng chờ. Admin duyệt rồi mới hiện với khách. Chưa bán vé trên Pickee.</p>
      <div className="filter-chip-row">
        <button type="button" className={mode === "write" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setMode("write")}>
          Viết mới
        </button>
        <button type="button" className={mode === "paste" ? "filter-chip filter-chip--active" : "filter-chip"} onClick={() => setMode("paste")}>
          Dán bài có sẵn
        </button>
      </div>
      <div className="field">
        <label>Đơn vị tổ chức</label>
        <input value={organizerName} onChange={(event) => setOrganizerName(event.target.value)} />
      </div>
      <div className="field">
        <label>Website</label>
        <input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://" />
      </div>
      <div className="field">
        <label>Tên trải nghiệm</label>
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>
      <div className="field">
        <label>Tóm tắt</label>
        <textarea rows={2} value={summary} onChange={(event) => setSummary(event.target.value)} />
      </div>
      <div className="field">
        <label>Vì sao đáng đi</label>
        <textarea rows={2} value={whyGo} onChange={(event) => setWhyGo(event.target.value)} />
      </div>
      <div className="field">
        <label>{mode === "paste" ? "Dán caption của bạn" : "Bài viết"}</label>
        <div className="experience-import-actions">
          <button type="button" className="btn btn-secondary" onClick={() => wrap("## ", "")}>Tiêu đề</button>
          <button type="button" className="btn btn-secondary" onClick={() => wrap("**")}>Đậm</button>
          <button type="button" className="btn btn-secondary" onClick={() => wrap("*")}>Nghiêng</button>
          <button type="button" className="btn btn-secondary" onClick={() => wrap("\n- ", "")}>Gạch đầu dòng</button>
          <button type="button" className="btn btn-secondary" onClick={() => wrap("[", "](https://)")}>Link</button>
        </div>
        <textarea
          ref={bodyRef}
          rows={mode === "paste" ? 10 : 6}
          value={body}
          placeholder={mode === "paste" ? "Dán bài Facebook của bạn. Xuống dòng, emoji và link được giữ." : ""}
          onPaste={onPaste}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Địa điểm</label>
        <input value={venueName} onChange={(event) => setVenueName(event.target.value)} />
      </div>
      <div className="field">
        <label>Địa chỉ</label>
        <input value={venueAddress} onChange={(event) => setVenueAddress(event.target.value)} />
      </div>
      <div className="field">
        <label>Bắt đầu</label>
        <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
      </div>
      <div className="field">
        <label>Giá</label>
        <select value={priceMode} onChange={(event) => setPriceMode(event.target.value as PriceMode)}>
          <option value="FREE">Miễn phí</option>
          <option value="PRICED">Có giá</option>
          <option value="UNKNOWN">Chưa rõ</option>
        </select>
      </div>
      {priceMode === "PRICED" ? (
        <div className="field">
          <label>Giá từ (VND)</label>
          <input inputMode="numeric" value={priceFrom} onChange={(event) => setPriceFrom(event.target.value)} />
        </div>
      ) : null}
      <div className="field">
        <label>Ghi chú giá</label>
        <input
          value={priceNote}
          placeholder="Nếu có cả phần miễn phí, ghi ở đây"
          onChange={(event) => setPriceNote(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Link đặt chỗ bên ngoài</label>
        <input value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} />
      </div>
      <fieldset className="field">
        <legend>Đi cùng</legend>
        {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={audiences.includes(value)}
              onChange={(event) =>
                setAudiences(event.target.checked ? [...audiences, value] : audiences.filter((item) => item !== value))
              }
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className="field">
        <legend>Nhóm</legend>
        {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={categories.includes(value)}
              onChange={(event) =>
                setCategories(
                  event.target.checked ? [...categories, value] : categories.filter((item) => item !== value),
                )
              }
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label>Ảnh của bạn (tối đa 6)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => void addPhotos(event.target.files)}
        />
        <div className="experience-gallery">
          {imageUrls.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" />
          ))}
        </div>
      </div>
      <button type="button" className="btn" disabled={busy} onClick={() => void send()}>
        Gửi chờ duyệt
      </button>
      {message ? <p style={{ color: "crimson" }}>{message}</p> : null}
    </div>
  );
}

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const shifted = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
}
