"use client";

import { OrderPhoneLinks } from "./order-phone-links";

type Props = {
  role: "customer" | "provider";
  education?: boolean;
  sports?: boolean;
  contacts: {
    customer: { phone: string | null; displayName?: string | null };
    provider: { phone: string | null; label?: string };
  };
};

export function ServiceRequestZaloContact({
  role,
  contacts,
  education = false,
  sports = false,
}: Props) {
  const customerHint = education
    ? "Trao đổi với Phụ trách lớp để được tư vấn cụ thể."
    : sports
      ? "Chat/Zalo sân nếu cần đổi giờ hoặc hỏi còn trống không."
      : "Trao đổi báo giá với thợ (kèm ảnh hiện trạng) qua Zalo trước khi thợ nhận việc.";
  const providerHint = education
    ? "Liên hệ Zalo phụ huynh để tư vấn trước khi Xác nhận/Từ chối."
    : sports
      ? "Liên hệ Zalo khách để xác nhận khung giờ trước khi nhận/từ chối."
      : "Liên hệ Zalo khách để báo giá và trao đổi thêm trước khi Nhận/Từ chối.";

  return (
    <div>
      <p className="stat" style={{ margin: "0 0 10px" }}>
        {role === "customer" ? customerHint : providerHint}
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
