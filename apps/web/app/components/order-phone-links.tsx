"use client";

type Contact = {
  phone: string | null;
  label: string;
};

type Props = {
  contacts: {
    customer: { phone: string | null; displayName?: string | null; avatarUrl?: string | null };
    provider: { phone: string | null; label?: string };
    runner?: { phone: string | null; displayName?: string | null } | null;
  };
  /** Hide own role's phone (e.g. provider doesn't need their own number) */
  hideRole?: "customer" | "provider" | "runner";
  /** Chỉ hiện SĐT khách — dùng trên app Tiệm */
  showOnly?: "customer";
  compact?: boolean;
};

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  return phone;
}

/** Zalo deep link — mở chat/gọi trong app Zalo hoặc zalo.me */
function zaloHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("84")) return `https://zalo.me/${digits}`;
  if (digits.startsWith("0")) return `https://zalo.me/84${digits.slice(1)}`;
  return `https://zalo.me/84${digits}`;
}

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

export function CustomerFace({
  displayName,
  avatarUrl,
}: {
  displayName?: string | null;
  avatarUrl?: string | null;
}) {
  const name = displayName?.trim() ?? "";
  const initial = (name || "K").slice(0, 1).toUpperCase();
  return (
    <div className="order-customer-face">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="order-customer-avatar" />
      ) : (
        <span className="order-customer-avatar order-customer-avatar--empty" aria-hidden>
          {initial}
        </span>
      )}
      <span className="order-customer-face-text">
        <strong>{name || "Chưa có tên Zalo"}</strong>
        <span className="stat">Tên Zalo</span>
      </span>
    </div>
  );
}

function PhoneLink({ contact }: { contact: Contact }) {
  if (!contact.phone) return null;
  const display = formatPhoneDisplay(contact.phone);
  return (
    <a
      href={zaloHref(contact.phone)}
      className="order-phone-link"
      title={`Zalo ${contact.label} — chat hoặc gọi`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <PhoneIcon />
      <span>
        {contact.label}: {display}
      </span>
    </a>
  );
}

export function OrderPhoneLinks({ contacts, hideRole, showOnly, compact = false }: Props) {
  const items: Contact[] = [];

  if (showOnly === "customer") {
    if (contacts.customer.phone) {
      items.push({
        phone: contacts.customer.phone,
        label: "Khách",
      });
    }
  } else {
    if (hideRole !== "customer" && contacts.customer.phone) {
      items.push({
        phone: contacts.customer.phone,
        label: contacts.customer.displayName?.trim() || "Khách",
      });
    }
    if (hideRole !== "provider" && contacts.provider.phone) {
      items.push({
        phone: contacts.provider.phone,
        label: contacts.provider.label?.trim() || "Tiệm",
      });
    }
    if (hideRole !== "runner" && contacts.runner?.phone) {
      items.push({
        phone: contacts.runner.phone,
        label: contacts.runner.displayName?.trim() || "Runner",
      });
    }
  }

  const showCustomerFace = showOnly === "customer" || hideRole !== "customer";
  if (!showCustomerFace && items.length === 0) return null;

  return (
    <div>
      {showCustomerFace ? (
        <CustomerFace
          displayName={contacts.customer.displayName}
          avatarUrl={contacts.customer.avatarUrl}
        />
      ) : null}
      {items.length > 0 ? (
        <div className={compact ? "order-phone-links compact" : "order-phone-links"}>
          {items.map((item) => (
            <PhoneLink key={item.label} contact={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
