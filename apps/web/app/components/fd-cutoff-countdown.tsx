"use client";

import { useEffect, useState } from "react";
import {
  fdCutoffEpochMs,
  fdFormatRemaining,
  fdReceivingStartEpochMs,
} from "../../lib/family-dinner";

type Props = {
  serviceDate: string;
  cutoffTime: string;
  publishedAt?: string | null;
  /** Nhãn khi còn nhận đơn */
  activeLabel?: string;
  /** Nhãn khi đã hết giờ */
  pastLabel?: string;
};

/** Thanh thời gian còn lại tới giờ chốt đơn — cùng pattern VisitIntentTimer (Beauty). */
export function FdCutoffCountdown({
  serviceDate,
  cutoffTime,
  publishedAt,
  activeLabel = "Còn đến giờ chốt đơn",
  pastLabel = "Đã hết giờ nhận đơn",
}: Props) {
  const [now, setNow] = useState(() => Date.now());
  const start = fdReceivingStartEpochMs(serviceDate, publishedAt);
  const end = fdCutoffEpochMs(serviceDate, cutoffTime);
  const total = Math.max(end - start, 1);
  const elapsed = Math.max(0, now - start);
  const progress = Math.min(100, (elapsed / total) * 100);
  const remaining = end - now;
  const past = remaining <= 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="visit-intent-timer" style={{ marginTop: 10 }}>
      <div className="visit-intent-timer-labels">
        <span className="stat" style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          {past ? pastLabel : `${activeLabel}: ~${fdFormatRemaining(remaining)}`}
        </span>
        <span className="stat" style={{ margin: 0, fontSize: 12 }}>
          Chốt {cutoffTime.slice(0, 5)}
        </span>
      </div>
      <div className="visit-intent-timer-track" aria-hidden>
        <div
          className={past ? "visit-intent-timer-fill overdue" : "visit-intent-timer-fill"}
          style={{ width: `${String(past ? 100 : progress)}%` }}
        />
      </div>
    </div>
  );
}
