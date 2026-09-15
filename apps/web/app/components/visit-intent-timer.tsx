"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  createdAt: string;
  expectedAt: string;
  expiresAt: string;
  onExpired?: () => void;
};

function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "Hết hạn";
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${String(sec)} giây`;
  if (sec === 0) return `${String(min)} phút`;
  return `${String(min)} phút ${String(sec)} giây`;
}

export function VisitIntentTimer({ createdAt, expectedAt, expiresAt, onExpired }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const started = new Date(createdAt).getTime();
  const expected = new Date(expectedAt).getTime();
  const expires = new Date(expiresAt).getTime();
  const total = Math.max(expires - started, 1);
  const elapsed = Math.max(0, now - started);
  const progress = Math.min(100, (elapsed / total) * 100);
  const untilExpected = expected - now;
  const untilExpire = expires - now;
  const overdue = now > expected;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const expiredRef = useRef(false);
  useEffect(() => {
    if (untilExpire <= 0 && onExpired && !expiredRef.current) {
      expiredRef.current = true;
      onExpired();
    }
  }, [untilExpire, onExpired]);

  return (
    <div className="visit-intent-timer">
      <div className="visit-intent-timer-labels">
        <span className="stat" style={{ margin: 0, fontSize: 13 }}>
          {overdue ? "Đã quá giờ dự kiến" : `Còn ~${formatRemainingMs(untilExpected)}`}
        </span>
        <span className="stat" style={{ margin: 0, fontSize: 12 }}>
          Tự hủy sau {formatRemainingMs(untilExpire)}
        </span>
      </div>
      <div className="visit-intent-timer-track" aria-hidden>
        <div
          className={
            overdue ? "visit-intent-timer-fill overdue" : "visit-intent-timer-fill"
          }
          style={{ width: `${String(progress)}%` }}
        />
      </div>
    </div>
  );
}
