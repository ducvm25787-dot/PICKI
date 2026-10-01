"use client";

import { useEffect, useState } from "react";

export function VerifiedQrImage({ path }: { path: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}${path}`;
    let cancelled = false;
    void import("qrcode").then((QR) =>
      QR.toDataURL(url, { margin: 1, width: 220 }).then((data) => {
        if (!cancelled) setSrc(data);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) return <p className="stat">Đang tạo mã…</p>;
  return (
    <img
      src={src}
      alt="Mã QR Pickee Verified"
      width={220}
      height={220}
      style={{ display: "block", background: "#fff", borderRadius: 12 }}
    />
  );
}
