"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";

type Location = { providerId: string; brandName: string; role?: string };
type Plan = {
  id: string;
  code: string;
  name: string;
  gracePeriodDays: number;
  maxLocations: number | null;
  maxMembers: number | null;
  featureFlags: Record<string, boolean>;
};
type Price = { id: string; planId: string; durationMonths: number; priceVnd: number };
type Subscription = {
  status: string;
  startsAt: string;
  expiresAt: string;
  gracePeriodDays: number;
} | null;
type Notice = { id: string; kind: string };

export default function ProviderSubscriptionPage() {
  const [providerId, setProviderId] = useState("");
  const [brand, setBrand] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [planLimits, setPlanLimits] = useState<Plan | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [invoices, setInvoices] = useState<{ id: string; amountVnd: number; status: string; issuedAt: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const mine = await api<{ locations: Location[] }>("/provider/locations/mine");
        const first = mine.locations[0];
        if (!first) {
          setError("Chưa có quán");
          return;
        }
        setProviderId(first.providerId);
        setBrand(first.brandName);
        const catalog = await api<{ plans: Plan[]; prices: Price[] }>("/payments/plans");
        setPlans(catalog.plans);
        setPrices(catalog.prices);
        const state = await api<{
          canManage: boolean;
          subscription: Subscription;
          plan: Plan | null;
          invoices: typeof invoices;
          notices: Notice[];
        }>(`/payments/subscription?providerId=${first.providerId}`);
        setCanManage(state.canManage);
        setSubscription(state.subscription);
        setPlanLimits(state.plan);
        setInvoices(state.invoices);
        setNotices(state.notices);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Không tải được gói");
      }
    })();
  }, []);

  async function renew(planPriceId: string) {
    setMessage(null);
    setError(null);
    try {
      const res = await api<{ devConfirmPath?: string; amountVnd: number; qrCode?: string }>(
        "/payments/subscription/checkout",
        { method: "POST", body: JSON.stringify({ providerId, planPriceId }) },
      );
      if (res.devConfirmPath) {
        await api(res.devConfirmPath.replace(/^\/v1/, ""), { method: "POST" });
        setMessage(`Đã thanh toán ${formatVnd(res.amountVnd)} và gia hạn gói.`);
        const state = await api<{
          subscription: Subscription;
          plan: Plan | null;
          invoices: typeof invoices;
          notices: Notice[];
        }>(`/payments/subscription?providerId=${providerId}`);
        setSubscription(state.subscription);
        setPlanLimits(state.plan);
        setInvoices(state.invoices);
        setNotices(state.notices);
        return;
      }
      setMessage(res.qrCode ? `Đã tạo QR. Quét để thanh toán.\n${res.qrCode}` : "Đã tạo hóa đơn, chờ thanh toán.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không gia hạn được");
    }
  }

  const expires = subscription ? new Date(subscription.expiresAt) : null;
  const graceLeft =
    expires && subscription
      ? Math.max(0, Math.ceil((expires.getTime() + subscription.gracePeriodDays * 86400000 - Date.now()) / 86400000))
      : 0;

  return (
    <div className="container">
      <h1 style={{ fontSize: 22 }}>Gói dịch vụ</h1>
      <p className="stat">{brand}</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {message ? <p>{message}</p> : null}
      <div className="card" style={{ marginBottom: 12 }}>
        {subscription ? (
          <>
            <p>Trạng thái {subscription.status}</p>
            <p>Bắt đầu {new Date(subscription.startsAt).toLocaleDateString("vi-VN")}</p>
            <p>Hết hạn {expires?.toLocaleDateString("vi-VN")}</p>
            <p>Grace còn khoảng {graceLeft} ngày sau hạn, nếu đang trong hạn thì chưa dùng grace.</p>
            {planLimits ? (
              <p className="stat">
                Giới hạn điểm bán {planLimits.maxLocations ?? "không giới hạn"} · thành viên {planLimits.maxMembers ?? "không giới hạn"}
              </p>
            ) : null}
            {notices.map((notice) => (
              <p key={notice.id}>Nhắc gói: {notice.kind}</p>
            ))}
          </>
        ) : (
          <p>Chưa có gói. Đăng nhập vẫn bình thường.</p>
        )}
      </div>
      {plans.map((plan) => (
        <div key={plan.id} className="card" style={{ marginBottom: 12 }}>
          <strong>{plan.name}</strong>
          {prices
            .filter((price) => price.planId === plan.id)
            .map((price) => (
              <div key={price.id} style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                <span>
                  {price.durationMonths} tháng · {formatVnd(price.priceVnd)}
                </span>
                {canManage ? (
                  <button type="button" className="btn" onClick={() => void renew(price.id)}>
                    {subscription ? "Gia hạn" : "Chọn gói"}
                  </button>
                ) : (
                  <span className="stat">Chỉ xem</span>
                )}
              </div>
            ))}
        </div>
      ))}
      <div className="card">
        <p className="section-title">Hóa đơn</p>
        {invoices.length === 0 ? <p className="stat">Chưa có hóa đơn.</p> : null}
        {invoices.map((invoice) => (
          <p key={invoice.id}>
            {invoice.status} · {formatVnd(invoice.amountVnd)}
          </p>
        ))}
      </div>
    </div>
  );
}
