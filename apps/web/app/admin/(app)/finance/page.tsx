"use client";

import { useEffect, useState } from "react";
import { AdminPageShell } from "../../../components/admin-session-context";
import { api } from "../../../../lib/api";
import { formatVnd } from "../../../../lib/money";

type Policy = {
  id: string;
  scopeType: string;
  scopeKey: string;
  revenueModel: string;
  subscriptionRequired: boolean;
  transactionFeeType: string;
  transactionFeeValue: number;
  transactionFeeBasis: string;
  policySource: string;
  contractRef: string | null;
  note: string | null;
  version: number;
  effectiveTo: string | null;
};
type Plan = {
  id: string;
  code: string;
  name: string;
  providerType: string | null;
  maxLocations: number | null;
  maxMembers: number | null;
  gracePeriodDays: number;
  active: boolean;
  featureFlags: Record<string, boolean>;
};
type Price = { id: string; planId: string; durationMonths: number; priceVnd: number; active: boolean };

export default function GlobalFinancePage() {
  const [tab, setTab] = useState<"overview" | "entries" | "plans" | "campaigns">("plans");
  const [data, setData] = useState<{
    overview: Record<string, number>;
    entries: { id: string; entryType: string; amountVnd: number; fromParty: string; toParty: string }[];
    policies: Policy[];
    plans: { plans: Plan[]; prices: Price[]; onboardingTrial: { months: number; planId: string | null } };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ dedupedGmv: number; campaigns: { campaignId: string; name: string; orders: number; gmv: number }[] } | null>(null);

  function load() {
    return api<NonNullable<typeof data>>("/admin/finance").then(setData);
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : "Không tải được tài chính"));
    void api<NonNullable<typeof campaigns>>("/admin/finance/campaigns")
      .then(setCampaigns)
      .catch(() => setCampaigns(null));
  }, []);

  return (
    <AdminPageShell title="Tài chính">
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {(
          [
            ["overview", "Tổng quan"],
            ["entries", "Giao dịch"],
            ["plans", "Gói & phí"],
            ["campaigns", "Chiến dịch"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className="btn btn-secondary" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {data && tab === "overview" ? (
        <div className="card">
          <p>GMV {formatVnd(data.overview.gmv ?? 0)}</p>
          <p>Phí giao dịch {formatVnd(data.overview.platformFee ?? 0)}</p>
          <p>Doanh thu gói {formatVnd(data.overview.subscriptionRevenue ?? 0)}</p>
          <p>Đóng góp từ đơn {formatVnd(data.overview.orderContribution ?? 0)}</p>
        </div>
      ) : null}
      {data && tab === "entries" ? (
        <div className="card">
          {data.entries.length === 0 ? <p className="stat">Chưa có bút toán.</p> : null}
          {data.entries.map((entry) => (
            <p key={entry.id}>
              {entry.entryType} {entry.fromParty} → {entry.toParty} {formatVnd(entry.amountVnd)}
            </p>
          ))}
        </div>
      ) : null}
      {data && tab === "plans" ? <PlansPanel data={data} onSaved={() => void load()} /> : null}
      {tab === "campaigns" && campaigns ? (
        <div className="card">
          <p>GMV đã khử trùng {formatVnd(campaigns.dedupedGmv)}</p>
          {campaigns.campaigns.length === 0 ? <p className="stat">Chưa có attribution. Hiệu ứng tài chính = 0.</p> : null}
          {campaigns.campaigns.map((row) => (
            <p key={row.campaignId}>
              {row.name} · {row.orders} đơn · GMV {formatVnd(row.gmv)}
            </p>
          ))}
        </div>
      ) : null}
    </AdminPageShell>
  );
}

function PlansPanel({
  data,
  onSaved,
}: {
  data: {
    policies: Policy[];
    plans: { plans: Plan[]; prices: Price[]; onboardingTrial: { months: number; planId: string | null } };
  };
  onSaved: () => void;
}) {
  const openPolicies = data.policies.filter((policy) => !policy.effectiveTo && policy.scopeKey !== "onboarding_trial");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <PolicyForm onSaved={onSaved} />
      <TrialForm trial={data.plans.onboardingTrial} plans={data.plans.plans} onSaved={onSaved} />
      <PlanForm onSaved={onSaved} />
      <div className="card">
        <p className="section-title">Chính sách đang hiệu lực</p>
        {openPolicies.length === 0 ? <p className="stat">Chưa có policy. Quán là FREE, phí giao dịch bằng 0.</p> : null}
        {openPolicies.map((policy) => (
          <p key={policy.id}>
            {policy.scopeType} {policy.scopeKey || "system"} · {policy.revenueModel} · {policy.transactionFeeType}{" "}
            {policy.transactionFeeValue} · {policy.policySource}
            {policy.contractRef ? ` · ${policy.contractRef}` : ""} · v{policy.version}
            {policy.note ? ` · ${policy.note}` : ""}
          </p>
        ))}
      </div>
      <ResolveBox />
      <div className="card">
        <p className="section-title">Gói thuê bao</p>
        {data.plans.plans.map((plan) => (
          <p key={plan.id}>
            {plan.name} ({plan.code}) {plan.active ? "" : "· tắt"} · grace {plan.gracePeriodDays} ngày ·{" "}
            {data.plans.prices
              .filter((price) => price.planId === plan.id && price.active)
              .map((price) => `${price.durationMonths} tháng ${formatVnd(price.priceVnd)}`)
              .join(", ")}
          </p>
        ))}
        <PriceForm plans={data.plans.plans} onSaved={onSaved} />
      </div>
    </div>
  );
}

function PolicyForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({
    scopeType: "PROVIDER_TYPE",
    scopeKey: "FOOD",
    revenueModel: "TRANSACTION_FEE",
    subscriptionRequired: false,
    transactionFeeType: "PERCENT",
    transactionFeeValue: "300",
    transactionFeeBasis: "MERCHANDISE_GMV",
    policySource: "DEFAULT",
    contractRef: "",
    note: "",
  });
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        void api("/admin/finance/policies", {
          method: "POST",
          body: JSON.stringify({
            ...form,
            subscriptionRequired: form.subscriptionRequired,
            transactionFeeValue: Number(form.transactionFeeValue),
          }),
        })
          .then(onSaved)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : "Không lưu được"));
      }}
    >
      <p className="section-title">Chính sách thương mại</p>
      <select value={form.scopeType} onChange={(event) => setForm({ ...form, scopeType: event.target.value })}>
        {["SYSTEM", "PROVIDER_TYPE", "PROVIDER", "CITY", "ZONE", "LOCATION"].map((scope) => (
          <option key={scope}>{scope}</option>
        ))}
      </select>
      <input placeholder="scope key: FOOD, provider id, zone id… để trống nếu SYSTEM" value={form.scopeKey} onChange={(event) => setForm({ ...form, scopeKey: event.target.value })} />
      <select value={form.revenueModel} onChange={(event) => setForm({ ...form, revenueModel: event.target.value })}>
        {["FREE", "SUBSCRIPTION", "TRANSACTION_FEE", "HYBRID", "ENTERPRISE"].map((model) => (
          <option key={model}>{model}</option>
        ))}
      </select>
      <label>
        <input type="checkbox" checked={form.subscriptionRequired} onChange={(event) => setForm({ ...form, subscriptionRequired: event.target.checked })} /> Bắt buộc gói
      </label>
      <select value={form.transactionFeeType} onChange={(event) => setForm({ ...form, transactionFeeType: event.target.value })}>
        {["NONE", "PERCENT", "FIXED"].map((type) => (
          <option key={type}>{type}</option>
        ))}
      </select>
      <input placeholder="Giá trị phí. PERCENT là basis point, 300 = 3%" value={form.transactionFeeValue} onChange={(event) => setForm({ ...form, transactionFeeValue: event.target.value })} />
      <select value={form.transactionFeeBasis} onChange={(event) => setForm({ ...form, transactionFeeBasis: event.target.value })}>
        {["MERCHANDISE_GMV", "MERCHANDISE_AFTER_PROVIDER_DISCOUNT", "ORDER_FIXED"].map((basis) => (
          <option key={basis}>{basis}</option>
        ))}
      </select>
      <select value={form.policySource} onChange={(event) => setForm({ ...form, policySource: event.target.value })}>
        {["DEFAULT", "CONTRACT", "PROMOTION", "MANUAL_OVERRIDE"].map((source) => (
          <option key={source}>{source}</option>
        ))}
      </select>
      <input placeholder="contract ref" value={form.contractRef} onChange={(event) => setForm({ ...form, contractRef: event.target.value })} />
      <input placeholder="Ghi chú" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
      <button type="submit" className="btn">Lưu phiên bản mới</button>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
    </form>
  );
}

function TrialForm({
  trial,
  plans,
  onSaved,
}: {
  trial: { months: number; planId: string | null };
  plans: Plan[];
  onSaved: () => void;
}) {
  const [months, setMonths] = useState(String(trial.months));
  const [planId, setPlanId] = useState(trial.planId ?? "");
  const [providerId, setProviderId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        void api("/admin/finance/onboarding-trial", {
          method: "POST",
          body: JSON.stringify({ months: Number(months), planId: planId || null }),
        })
          .then(() => {
            setMessage("Đã lưu trial mặc định. Quán đang có không tự đổi.");
            onSaved();
          })
          .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Không lưu được"));
      }}
    >
      <p className="section-title">Trial nhà cung cấp mới</p>
      <p className="stat">Đang đặt {trial.months} tháng. 0 = tắt. Không hardcode 3 tháng.</p>
      <input value={months} onChange={(event) => setMonths(event.target.value)} />
      <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
        <option value="">Chọn gói gắn vào trial</option>
        {plans.filter((plan) => plan.active).map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn">Lưu cấu hình trial</button>
      <input placeholder="Provider id để cấp trial thủ công" value={providerId} onChange={(event) => setProviderId(event.target.value)} />
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          void api(`/admin/finance/providers/${providerId}/trial`, { method: "POST" })
            .then((result) => setMessage(JSON.stringify(result)))
            .catch((err: unknown) => setMessage(err instanceof Error ? err.message : "Không cấp được"));
        }}
      >
        Cấp trial cho quán này
      </button>
      {message ? <p>{message}</p> : null}
    </form>
  );
}

function PlanForm({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState({ code: "", name: "", providerType: "", gracePeriodDays: "7", maxLocations: "", maxMembers: "", active: true });
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        void api("/admin/finance/plans", {
          method: "POST",
          body: JSON.stringify({
            code: form.code,
            name: form.name,
            providerType: form.providerType || null,
            gracePeriodDays: Number(form.gracePeriodDays),
            maxLocations: form.maxLocations ? Number(form.maxLocations) : null,
            maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
            active: form.active,
            featureFlags: {},
          }),
        }).then(onSaved);
      }}
    >
      <p className="section-title">Gói thuê bao</p>
      <input placeholder="Mã" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
      <input placeholder="Tên" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <input placeholder="provider_type, để trống nếu mọi loại" value={form.providerType} onChange={(event) => setForm({ ...form, providerType: event.target.value })} />
      <input placeholder="Grace days" value={form.gracePeriodDays} onChange={(event) => setForm({ ...form, gracePeriodDays: event.target.value })} />
      <input placeholder="max locations" value={form.maxLocations} onChange={(event) => setForm({ ...form, maxLocations: event.target.value })} />
      <input placeholder="max members" value={form.maxMembers} onChange={(event) => setForm({ ...form, maxMembers: event.target.value })} />
      <button type="submit" className="btn">Lưu gói</button>
    </form>
  );
}

function PriceForm({ plans, onSaved }: { plans: Plan[]; onSaved: () => void }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [durationMonths, setDuration] = useState("1");
  const [priceVnd, setPrice] = useState("");
  return (
    <form
      style={{ display: "grid", gap: 8, marginTop: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        void api("/admin/finance/plan-prices", {
          method: "POST",
          body: JSON.stringify({ planId, durationMonths: Number(durationMonths), priceVnd: Number(priceVnd) }),
        }).then(onSaved);
      }}
    >
      <select value={planId} onChange={(event) => setPlanId(event.target.value)}>
        {plans.map((plan) => (
          <option key={plan.id} value={plan.id}>
            {plan.name}
          </option>
        ))}
      </select>
      <select value={durationMonths} onChange={(event) => setDuration(event.target.value)}>
        {[1, 3, 6, 12, 36].map((months) => (
          <option key={months} value={months}>
            {months} tháng
          </option>
        ))}
      </select>
      <input placeholder="Giá VND" value={priceVnd} onChange={(event) => setPrice(event.target.value)} />
      <button type="submit" className="btn btn-secondary">Lưu giá</button>
    </form>
  );
}

function ResolveBox() {
  const [providerId, setProviderId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  return (
    <form
      className="card"
      style={{ display: "grid", gap: 8 }}
      onSubmit={(event) => {
        event.preventDefault();
        const qs = new URLSearchParams({ providerId });
        if (zoneId) qs.set("zoneId", zoneId);
        void api<{ label: string }>(`/admin/finance/policies/resolve?${qs}`).then((row) => setLabel(row.label));
      }}
    >
      <p className="section-title">Chính sách đang thắng</p>
      <input placeholder="Provider id" value={providerId} onChange={(event) => setProviderId(event.target.value)} />
      <input placeholder="Zone id, nếu có" value={zoneId} onChange={(event) => setZoneId(event.target.value)} />
      <button type="submit" className="btn btn-secondary">Xem effective policy</button>
      {label ? <p>{label}</p> : null}
    </form>
  );
}
