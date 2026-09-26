"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandMark } from "../../../components/brand-mark";
import { ExperienceBody } from "../../../components/experience-body";
import { api } from "../../../../lib/api";
import { track } from "../../../../lib/analytics";
import {
  CATEGORY_LABELS,
  audienceLine,
  experienceApi,
  experienceHref,
  formatOccurrence,
  priceLabel,
  type ExperienceCard,
} from "../../../../lib/experiences";

export default function ExperienceDetailPage() {
  const params = useParams<{ city: string; id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<ExperienceCard | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void api<ExperienceCard>(experienceApi(params.city, `/${params.id}`))
      .then((next) => {
        setRow(next);
        track("experience_detail", { properties: { experienceId: next.id } });
      })
      .catch(() => router.replace(experienceHref(params.city)));
  }, [params.city, params.id, router]);

  async function toggleSave() {
    if (!row) return;
    if (row.saved) {
      await api(experienceApi(params.city, `/${row.id}/save`), { method: "DELETE" });
      setRow({ ...row, saved: false });
      return;
    }
    await api(experienceApi(params.city, `/${row.id}/save`), {
      method: "POST",
      body: JSON.stringify({ saveFor: null }),
    });
    setRow({ ...row, saved: true });
  }

  async function toggleInterest() {
    if (!row) return;
    if (row.interested) {
      await api(experienceApi(params.city, `/${row.id}/interest`), { method: "DELETE" });
      setRow({ ...row, interested: false });
      return;
    }
    await api(experienceApi(params.city, `/${row.id}/interest`), { method: "POST" });
    setRow({ ...row, interested: true });
  }

  async function book() {
    if (!row) return;
    const res = await api<{ url: string }>(experienceApi(params.city, `/${row.id}/booking-click`), {
      method: "POST",
    });
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function share() {
    if (!row) return;
    const url = window.location.href;
    track("experience_share", { properties: { experienceId: row.id } });
    if (navigator.share) {
      await navigator.share({ title: row.title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setMessage("Đã chép link.");
  }

  if (!row) {
    return (
      <div className="container">
        <p className="stat">Đang tải…</p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header-row">
        <BrandMark subtitle={row.city?.label ?? "Trải nghiệm"} />
      </div>
      <p className="stat">
        <Link href={experienceHref(params.city)}>← Trải nghiệm</Link>
      </p>
      {row.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.coverUrl} alt="" className="experience-cover" />
      ) : (
        <div className="experience-cover experience-cover--placeholder">
          Trải nghiệm {row.city?.label ?? ""}
        </div>
      )}
      <h1 className="section-title">{row.title}</h1>
      {row.soldOut ? <p className="fresh-badge">Hết vé</p> : null}
      <p>{row.summary}</p>
      <p>{row.whyGo}</p>
      <ExperienceBody blocks={row.bodyBlocks ?? []} />
      {(row.imageUrls ?? []).length > 1 ? (
        <div className="experience-gallery">
          {row.imageUrls?.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" />
          ))}
        </div>
      ) : null}
      <p className="stat">{row.occurrences.map((item) => formatOccurrence(item.startAt)).join(" · ")}</p>
      <p className="stat">Hợp: {audienceLine(row.audiences)}</p>
      <p className="stat">{row.categories.map((item) => CATEGORY_LABELS[item] ?? item).join(" · ")}</p>
      <p>
        {priceLabel(row)}
        {row.priceNote ? ` · ${row.priceNote}` : ""}
      </p>
      {row.durationMinutes ? <p className="stat">Khoảng {row.durationMinutes} phút</p> : null}
      {row.ageNote ? <p className="stat">{row.ageNote}</p> : null}
      {row.language ? <p className="stat">Ngôn ngữ: {row.language}</p> : null}
      <p>
        {row.venue.name}
        {row.venue.address ? ` · ${row.venue.address}` : ""}
      </p>
      <p className="stat">{row.organizer.name}</p>
      {row.bookingDeadline ? (
        <p className="stat">Đặt chỗ trước {formatOccurrence(row.bookingDeadline)}</p>
      ) : null}
      {row.registrationDeadline ? (
        <p className="stat">Đăng ký trước {formatOccurrence(row.registrationDeadline)}</p>
      ) : null}
      {row.venue.lat != null && row.venue.lng != null ? (
        <p>
          <Link
            href={`/navigate?destLat=${row.venue.lat}&destLng=${row.venue.lng}&label=${encodeURIComponent(row.venue.name)}`}
          >
            Chỉ đường
          </Link>
        </p>
      ) : null}
      <div className="experience-import-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void toggleSave()}>
          {row.saved ? "Đã lưu" : "Lưu"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void toggleInterest()}>
          {row.interested ? "Đang quan tâm" : "Quan tâm"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void share()}>
          Chia sẻ
        </button>
        {row.bookingUrl &&
        !row.soldOut &&
        !(row.bookingDeadline && Date.parse(row.bookingDeadline) < Date.now()) ? (
          <button type="button" className="btn" onClick={() => void book()}>
            Mua vé
          </button>
        ) : null}
      </div>
      {message ? <p className="stat">{message}</p> : null}
    </div>
  );
}
