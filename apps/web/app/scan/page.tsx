"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function tokenFromScan(raw: string): string | null {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "v" && parts[1]) return decodeURIComponent(parts[1]);
  } catch {
    /* plain token */
  }
  if (/^[A-Za-z0-9_-]{16,}$/.test(text)) return text;
  return null;
}

export default function ScanQrPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hint, setHint] = useState("Đưa sticker vào khung hình.");
  const [pasted, setPasted] = useState("");

  useEffect(() => {
    const Detector = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setHint("Máy này chưa mở được camera. Dùng camera điện thoại để quét sticker, hoặc dán link bên dưới.");
      return;
    }
    let stopped = false;
    let stream: MediaStream | null = null;
    const detector = new Detector({ formats: ["qr_code"] });

    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((next) => {
        stream = next;
        const video = videoRef.current;
        if (!video || stopped) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        video.srcObject = next;
        void video.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const token = codes.map((code) => tokenFromScan(code.rawValue)).find(Boolean);
            if (token) {
              stopped = true;
              next.getTracks().forEach((track) => track.stop());
              router.replace(`/v/${token}`);
              return;
            }
          } catch {
            /* frame not ready */
          }
          window.setTimeout(() => void tick(), 400);
        };
        void tick();
      })
      .catch(() => {
        setHint("Không mở được camera. Dán link trên sticker vào ô bên dưới.");
      });

    return () => {
      stopped = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [router]);

  function openPasted() {
    const token = tokenFromScan(pasted);
    if (!token) {
      setHint("Link này không phải QR Pickee.");
      return;
    }
    router.replace(`/v/${token}`);
  }

  return (
    <main className="container" style={{ paddingTop: 24 }}>
      <h1 className="section-title">Quét QR</h1>
      <p className="tagline">{hint}</p>
      <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 16, background: "#111" }} />
      <label className="field" style={{ marginTop: 16 }}>
        <span>Hoặc dán link trên sticker</span>
        <input value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…/v/…" />
      </label>
      <button type="button" className="btn" onClick={openPasted}>
        Mở cửa hàng
      </button>
    </main>
  );
}
