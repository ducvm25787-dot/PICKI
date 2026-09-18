type BrandMarkProps = {
  title?: string;
  subtitle?: string;
  /** customer | provider | runner | admin */
  tone?: "customer" | "provider" | "runner" | "admin";
  compact?: boolean;
  showSymbol?: boolean;
};

export function BrandMark({
  title = "pickee",
  subtitle,
  tone = "customer",
  compact = false,
  showSymbol = true,
}: BrandMarkProps) {
  const isCustomer = tone === "customer";
  const size = compact ? 36 : 48;

  return (
    <div className={`brand-mark brand-mark--${tone}${compact ? " brand-mark--compact" : ""}`}>
      {showSymbol ? (
        <span className="brand-mark-icon" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/symbol.png"
            alt=""
            width={size}
            height={size}
            className={
              isCustomer ? undefined : `brand-mark-symbol brand-mark-symbol--${tone}`
            }
            style={{ width: size, height: size, objectFit: "contain", display: "block" }}
          />
        </span>
      ) : null}
      <div className="brand-mark-text">
        <div className={`logo${isCustomer ? " logo--pickee" : ""}`}>{title}</div>
        {subtitle ? <div className="tagline">{subtitle}</div> : null}
      </div>
    </div>
  );
}
