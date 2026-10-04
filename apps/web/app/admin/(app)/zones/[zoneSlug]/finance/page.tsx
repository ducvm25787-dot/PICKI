"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";
import { formatVnd } from "../../../../../../lib/money";

type Overview = Record<string, number>;
type Entry = {
  id: string;
  entryType: string;
  amountVnd: number;
  fromParty: string;
  toParty: string;
  sourceType: string;
  sourceId: string | null;
  orderId: string | null;
  paymentId: string | null;
  billingPaymentId: string | null;
  occurredAt: string;
  postedAt: string;
  reversalOfId: string | null;
  snapshot: unknown;
};
type ProviderRow = {
  providerId: string;
  brandName: string;
  standing: string;
  subscriptionStatus: string | null;
  signals: Record<string, number>;
};
type Bundle = {
  zone: { id: string; displayName: string };
  canWriteSettlement: boolean;
  canWriteStanding: boolean;
  overview: Overview;
  entries: Entry[];
  providers: ProviderRow[];
  settlements: { id: string; partyType: string; amountVnd: number; direction: string; reference: string | null; note: string | null; paidAt: string | null }[];
};

const SIGNAL_LABEL: Record<string, string> = {
  acceptedThenCancelled: "Nhận rồi hủy",
  lateCancel: "Hủy muộn",
  runnerAssignedThenCancelled: "Đã có tài xế rồi hủy",
  customerConfirmedAfterCancel: "Khách xác nhận đã nhận sau hủy",
  suspectedOffPlatform: "Nghi ngờ giao ngoài nền tảng",
};

export default function ZoneFinancePage() {
  const params = useParams<{ zoneSlug: string }>();
  const [tab, setTab] = useState<"overview" | "entries" | "settlement">("overview");
  const [data, setData] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [filters, setFilters] = useState({ entryType: "", providerId: "", orderId: "", party: "", from: "", to: "" });

  async function load(next = filters) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) qs.set(key, value);
    }
    const suffix = qs.toString() ? `?${qs}` : "";
    const bundle = await api<Bundle>(`/admin/zones/${params.zoneSlug}/finance${suffix}`);
    setData(bundle);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được tài chính"));
  }, [params.zoneSlug]);

  return (
    <AdminPageShell title={data ? `Tài chính · ${data.zone.displayName}` : "Tài chính"}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {(
          [
            ["overview", "Tổng quan"],
            ["entries", "Giao dịch"],
            ["settlement", "Đối soát"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="btn btn-secondary" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {data && tab === "overview" ? <OverviewGrid overview={data.overview} providers={data.providers} canWriteStanding={data.canWriteStanding} onChanged={() => void load()} /> : null}
      {data && tab === "entries" ? (
        <>
          <form
            className="card"
            style={{ display: "grid", gap: 8, marginBottom: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              void load(filters).catch((err: unknown) => setError(err instanceof Error ? err.message : "Không lọc được"));
            }}
          >
            <input placeholder="Loại bút toán" value={filters.entryType} onChange={(event) => setFilters({ ...filters, entryType: event.target.value })} />
            <input placeholder="Provider id" value={filters.providerId} onChange={(event) => setFilters({ ...filters, providerId: event.target.value })} />
            <input placeholder="Order id" value={filters.orderId} onChange={(event) => setFilters({ ...filters, orderId: event.target.value })} />
            <input placeholder="Bên (CUSTOMER, PROVIDER, RUNNER, PICKEE)" value={filters.party} onChange={(event) => setFilters({ ...filters, party: event.target.value })} />
            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
            <button type="submit" className="btn">Lọc</button>
          </form>
          <EntryList entries={data.entries} onOpen={setSelected} />
          {selected ? <EntryDetail entry={selected} onClose={() => setSelected(null)} /> : null}
        </>
      ) : null}
      {data && tab === "settlement" ? (
        <SettlementPanel data={data} onDone={() => void load()} />
      ) : null}
    </AdminPageShell>
  );
}

function OverviewGrid({
  overview,
  providers,
  canWriteStanding,
  onChanged,
}: {
  overview: Overview;
  providers: ProviderRow[];
  canWriteStanding: boolean;
  onChanged: () => void;
}) {
  const rows: [string, number, boolean?][] = [
    ["GMV", overview.gmv ?? 0],
    ["Đơn đã ghi nhận", overview.orders ?? 0, true],
    ["Đơn đã hoàn thành", overview.fulfilledOrders ?? 0, true],
    ["Phí giao dịch Pickee", overview.platformFee ?? 0],
    ["Doanh thu gói (riêng, không cộng vào đơn)", overview.subscriptionRevenue ?? 0],
    ["Pickee tài trợ giao", overview.pickeeDeliverySubsidy ?? 0],
    ["Quán tài trợ giao", overview.providerDeliverySubsidy ?? 0],
    ["Runner phải trả", overview.runnerPayable ?? 0],
    ["Hoàn tiền", overview.refunds ?? 0],
    ["Quán còn được nhận", overview.pickeeOwesProvider ?? 0],
    ["Runner còn phải trả", overview.runnerOutstanding ?? 0],
    ["Đóng góp ròng từ đơn", overview.orderContribution ?? 0],
  ];
  return (
    <>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        {rows.map(([label, value, count]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span>{label}</span>
            <strong>{count ? String(value) : formatVnd(value)}</strong>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <p className="section-title">Tình trạng thương mại</p>
        {providers.length === 0 ? <p className="stat">Chưa có quán trong khu.</p> : null}
        {providers.map((provider) => (
          <StandingRow key={provider.providerId} provider={provider} canWrite={canWriteStanding} onChanged={onChanged} />
        ))}
      </div>
    </>
  );
}

function StandingRow({ provider, canWrite, onChanged }: { provider: ProviderRow; canWrite: boolean; onChanged: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function setStanding(standing: string) {
    setError(null);
    try {
      await api(`/admin/finance/providers/${provider.providerId}/standing`, {
        method: "POST",
        body: JSON.stringify({ standing, reason }),
      });
      setReason("");
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Không đổi được");
    }
  }
  return (
    <article style={{ marginBottom: 12 }}>
      <strong>{provider.brandName}</strong>
      <p className="stat">
        {provider.standing} · gói {provider.subscriptionStatus ?? "chưa có"}
      </p>
      <p className="stat">
        {Object.entries(provider.signals)
          .map(([key, value]) => `${SIGNAL_LABEL[key] ?? key}: ${value}`)
          .join(" · ")}
      </p>
      {canWrite ? (
        <>
          <input placeholder="Lý do bắt buộc" value={reason} onChange={(event) => setReason(event.target.value)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {["WATCH", "WARNED", "RESTRICTED", "BLOCKED", "NORMAL"].map((standing) => (
              <button key={standing} type="button" className="btn btn-secondary" disabled={!reason.trim()} onClick={() => void setStanding(standing)}>
                {standing === "NORMAL" ? "Trả về NORMAL" : standing}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="stat">Zone Admin chỉ xem. Finance đúng phạm vi mới đổi standing.</p>
      )}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </article>
  );
}

function EntryList({ entries, onOpen }: { entries: Entry[]; onOpen: (entry: Entry) => void }) {
  if (entries.length === 0) return <p className="stat">Chưa có bút toán.</p>;
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      {entries.map((entry) => (
        <button key={entry.id} type="button" className="btn btn-secondary" onClick={() => onOpen(entry)}>
          {entry.entryType} · {entry.fromParty} → {entry.toParty} · {formatVnd(entry.amountVnd)}
        </button>
      ))}
    </div>
  );
}

function EntryDetail({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <p className="section-title">{entry.entryType}</p>
      <p>{entry.fromParty} → {entry.toParty}</p>
      <p className="stat">Nguồn {entry.sourceType} {entry.sourceId ?? ""}</p>
      <p className="stat">Đơn {entry.orderId ?? "—"} · Thanh toán {entry.paymentId ?? entry.billingPaymentId ?? "—"}</p>
      <p className="stat">Phát sinh {new Date(entry.occurredAt).toLocaleString("vi-VN")}</p>
      <p className="stat">Ghi sổ {new Date(entry.postedAt).toLocaleString("vi-VN")}</p>
      <p className="stat">{entry.reversalOfId ? `Đảo bút toán ${entry.reversalOfId}` : "Không phải dòng đảo"}</p>
      <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(entry.snapshot, null, 2)}</pre>
      <button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>
    </div>
  );
}

function SettlementPanel({ data, onDone }: { data: Bundle; onDone: () => void }) {
  const [obligation, setObligation] = useState("PICKEE_OWES_PROVIDER");
  const [partyId, setPartyId] = useState(data.providers[0]?.providerId ?? "");
  const [counterpartyId, setCounterpartyId] = useState(data.providers[0]?.providerId ?? "");
  const [amountVnd, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lines: [string, number][] = [
    ["Quán nợ Pickee", data.overview.providerOwesPickee ?? 0],
    ["Pickee nợ quán", data.overview.pickeeOwesProvider ?? 0],
    ["Quán nợ runner", data.overview.providerOwesRunner ?? 0],
    ["Pickee nợ runner", data.overview.pickeeOwesRunner ?? 0],
  ];
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      {lines.map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{label}</span>
          <strong>{formatVnd(value)}</strong>
        </div>
      ))}
      {data.settlements.map((row) => (
        <p key={row.id} className="stat">
          {row.direction} {row.partyType} {formatVnd(row.amountVnd)} · {row.reference} · {row.note}
        </p>
      ))}
      {data.canWriteSettlement ? (
        <form
          style={{ display: "grid", gap: 8 }}
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            void api("/admin/finance/settlements", {
              method: "POST",
              body: JSON.stringify({
                obligation,
                partyId,
                counterpartyId: obligation === "PROVIDER_OWES_RUNNER" ? counterpartyId : undefined,
                zoneId: data.zone.id,
                amountVnd: Number(amountVnd),
                reference,
                note,
                paidAt: new Date(paidAt).toISOString(),
              }),
            })
              .then(() => {
                setMessage("Đã ghi một dòng tiền mới. Nghĩa vụ cũ không bị sửa.");
                onDone();
              })
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không ghi được"));
          }}
        >
          <select value={obligation} onChange={(event) => setObligation(event.target.value)}>
            <option value="PROVIDER_OWES_PICKEE">Đánh dấu đã thu — quán nợ Pickee</option>
            <option value="PICKEE_OWES_PROVIDER">Đánh dấu đã trả — Pickee nợ quán</option>
            <option value="PROVIDER_OWES_RUNNER">Đánh dấu quán đã trả runner</option>
            <option value="PICKEE_OWES_RUNNER">Đánh dấu Pickee đã trả runner</option>
          </select>
          <input placeholder="Id bên được thu hoặc trả" value={partyId} onChange={(event) => setPartyId(event.target.value)} />
          {obligation === "PROVIDER_OWES_RUNNER" ? (
            <input placeholder="Provider id trả runner" value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)} />
          ) : null}
          <input placeholder="Số tiền" value={amountVnd} onChange={(event) => setAmount(event.target.value)} />
          <input placeholder="Mã tham chiếu" value={reference} onChange={(event) => setReference(event.target.value)} />
          <input placeholder="Ghi chú" value={note} onChange={(event) => setNote(event.target.value)} />
          <input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          <button type="submit" className="btn">Ghi đối soát</button>
        </form>
      ) : (
        <p className="stat">Zone Admin không ghi đối soát. SUPER_ADMIN hoặc FINANCE đúng khu mới đánh dấu đã thu / đã trả.</p>
      )}
      {message ? <p>{message}</p> : null}
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </div>
  );
}
