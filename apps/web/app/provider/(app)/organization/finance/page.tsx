"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "../../../../../lib/api";
import { formatVnd } from "../../../../../lib/money";

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

export default function ChainFinancePage() {
  const params = useSearchParams();
  const [data, setData] = useState<Finance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopeType = params.get("scopeType");
  const scopeId = params.get("scopeId");

  useEffect(() => {
    const qs = scopeType && scopeId ? `?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(scopeId)}` : "";
    void api<Finance>(`/provider/organization/finance${qs}`)
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được"));
  }, [scopeType, scopeId]);

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
      <h1 style={{ fontSize: 22 }}>Tài chính chuỗi</h1>
      <p className="stat">Chỉ số của phạm vi đang chọn. Không gồm trợ giá nội bộ của Pickee cho quán khác.</p>
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
