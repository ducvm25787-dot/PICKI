"use client";

import { OrderPhoneLinks } from "./order-phone-links";

type Props = {
  role: "customer" | "provider";
  contacts: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
  };
};

export function ServiceRequestZaloContact({ role, contacts }: Props) {
  return (
    <div>
      <p className="stat" style={{ margin: "0 0 10px" }}>
        {role === "customer"
          ? "Trao đổi báo giá với thợ (kèm ảnh hiện trạng) qua Zalo trước khi thợ nhận việc."
          : "Liên hệ Zalo khách để báo giá và trao đổi thêm trước khi Nhận/Từ chối."}
      </p>
      <OrderPhoneLinks
        contacts={contacts}
        hideRole={role === "customer" ? "customer" : undefined}
        showOnly={role === "provider" ? "customer" : undefined}
        compact
      />
    </div>
  );
}
