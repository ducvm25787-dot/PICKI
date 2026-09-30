"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProviderPageShell, useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";

type Channel = {
  capability: "SELL_NOW" | "BREAKFAST_PREORDER" | "FAMILY_DINNER" | "LATE_NIGHT";
  label: string;
  href: string | null;
  enabled: boolean;
};

const CHANNEL_HINT: Record<Channel["capability"], string> = {
  SELL_NOW:
    "Khách gọi món và nhận trong ngày. Số lượng, hết, ẩn và giá hôm nay chỉnh ở tab Hôm nay.",
  BREAKFAST_PREORDER:
    "Khách đặt từ tối hôm trước, nhận sáng hôm sau. Chọn món từ Sản phẩm, trả trước, giao theo khung 15 phút.",
  FAMILY_DINNER:
    "Khách tự ghép mâm chính, phụ, rau, canh, cơm theo menu trong ngày. Trả trước, bếp nấu theo số đơn.",
  LATE_NIGHT:
    "Vẫn là menu bán ngay. Quán hiện thêm ở Góc ăn khuya trong khung giờ quán đặt.",
};

export default function ProviderSellingPage() {
  const { locationId } = useProviderLocation();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!locationId) return;
    const res = await api<{ channels: Channel[] }>(`/provider/locations/${locationId}/selling`);
    setChannels(res.channels);
  }, [locationId]);

  useEffect(() => {
    void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [load]);

  async function toggle(channel: Channel) {
    if (!locationId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ channels: Channel[] }>(`/provider/locations/${locationId}/selling`, {
        method: "PATCH",
        body: JSON.stringify({ capability: channel.capability, enabled: !channel.enabled }),
      });
      setChannels(res.channels);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProviderPageShell title="Cách bán">
      <h1 className="section-title">Cách bán</h1>
      <p className="tagline">Bật cách nào thì quán bán theo cách đó. Không cần chọn một kiểu quán.</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {channels.map((channel) => (
        <article key={channel.capability} className="card" style={{ marginBottom: 8 }}>
          <strong>{channel.label}</strong>
          <p className="tagline" style={{ margin: "4px 0 8px" }}>
            {CHANNEL_HINT[channel.capability]}
          </p>
          <p style={{ margin: "0 0 8px" }}>{channel.enabled ? "Đang bật" : "Đang tắt"}</p>
          <div className="board-row">
            <button type="button" className="btn" disabled={busy} onClick={() => void toggle(channel)}>
              {channel.enabled ? "Tắt" : "Bật"}
            </button>
            {channel.enabled && channel.href ? (
              <Link href={channel.href} className="btn btn-secondary">
                Mở
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </ProviderPageShell>
  );
}
