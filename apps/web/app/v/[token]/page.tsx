"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function VerifiedQrPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const token = params.token;
    if (!token) return;
    let cancelled = false;
    api<{ locationId: string }>(`/qr/${encodeURIComponent(token)}`)
      .then((res) => {
        if (!cancelled) router.replace(`/locations/${res.locationId}`);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  return (
    <main className="container" style={{ paddingTop: 32 }}>
      {missing ? (
        <>
          <h1 className="section-title">QR không còn hiệu lực</h1>
          <p className="tagline">Mã này đã được đổi hoặc cửa hàng chưa còn xác minh.</p>
        </>
      ) : (
        <p className="tagline">Đang mở cửa hàng…</p>
      )}
    </main>
  );
}
