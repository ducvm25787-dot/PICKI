"use client";

import { useEffect, useState } from "react";
import { useProviderLocation } from "../../../components/provider-location-context";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";

type Finance = {
  gmv: number;
  orders: number;
  refunds: number;
  transactionFee: number;
  providerFundedDiscount: number;
  providerDeliverySubsidy: number;
  netReceivable: number;
  paid: number;
  outstanding: number;
};

export default function LocationFinancePage() {
  const { activeLocation } = useProviderLocation();
  const [data, setData] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeLocation?.locationId) return;
    void api<Finance>(`/provider/finance?locationId=${activeLocation.locationId}`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }, [activeLocation?.locationId]);

  const rows: [string, number, boolean?][] = data
    ? [
        ["GMV", data.gmv],
        ["Đơn", data.orders, true],
        ["Hoàn tiền", data.refunds],
        ["Phí giao dịch", data.transactionFee],
        ["Quán tài trợ giá", data.providerFundedDiscount],
        ["Quán tài trợ giao", data.providerDeliverySubsidy],
        ["Phải nhận", data.netReceivable],
        ["Đã nhận", data.paid],
        ["Còn lại", data.outstanding],
      ]
    : [];

  return (
    <div className="container">
      <h1 style={{ fontSize: 22 }}>Tài chính điểm bán</h1>
      <p className="stat">{activeLocation?.locationName}</p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      <div className="card" style={{ display: "grid", gap: 8 }}>
        {rows.map(([label, value, count]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{label}</span>
            <strong>{count ? String(value) : formatVnd(value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
