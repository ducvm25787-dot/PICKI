"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminPageShell } from "../../../../../components/admin-session-context";
import { api } from "../../../../../../lib/api";

type Account = {
  id: string;
  displayName: string | null;
  fullName: string | null;
  phone: string | null;
  zaloLinked: boolean;
  dateOfBirth: string | null;
  addresses: string[];
  createdAt: string;
};

function phoneLabel(phone: string | null) {
  if (!phone) return "Chưa có số";
  if (phone.startsWith("+84")) return `0${phone.slice(3)}`;
  return phone;
}

function birthLabel(value: string | null) {
  if (!value) return "Chưa khai";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export default function AdminAccountsPage() {
  const params = useParams<{ zoneSlug: string }>();
  const slug = params.zoneSlug;
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ accounts: Account[] }>(`/admin/zones/${slug}/accounts`)
      .then((res) => setAccounts(res.accounts))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [slug]);

  return (
    <AdminPageShell title="Tài khoản">
      <h1 className="section-title">Tài khoản</h1>
      <p className="tagline">
        Tên hiển thị là tên Zalo khách tự nhập. Ngày sinh chỉ có khi khách đã khai để mua bia hơi. Địa chỉ là địa chỉ đã lưu trên Pickee.
      </p>
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {!accounts ? <p className="tagline">Đang tải…</p> : null}
      {accounts?.length === 0 ? <p className="tagline">Chưa có tài khoản.</p> : null}
      {accounts?.map((account) => (
        <article key={account.id} className="card" style={{ marginBottom: 8 }}>
          <strong>{account.displayName?.trim() || "Chưa đặt tên"}</strong>
          {account.fullName ? <p style={{ margin: "4px 0 0" }}>Họ tên khai: {account.fullName}</p> : null}
          <p style={{ margin: "4px 0 0" }}>
            {phoneLabel(account.phone)}
            {account.zaloLinked ? " · Đã liên kết Zalo" : ""}
          </p>
          <p className="stat" style={{ margin: "4px 0 0" }}>
            Ngày sinh: {birthLabel(account.dateOfBirth)}
          </p>
          <p className="stat" style={{ margin: "4px 0 0" }}>
            {account.addresses.length > 0 ? account.addresses.join(" · ") : "Chưa có địa chỉ đăng ký"}
          </p>
        </article>
      ))}
    </AdminPageShell>
  );
}
