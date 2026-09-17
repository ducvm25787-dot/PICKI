import { IconBrandPin } from "./nav-icons";

type BrandMarkProps = {
  title?: string;
  subtitle?: string;
  /** customer | provider | runner | admin */
  tone?: "customer" | "provider" | "runner" | "admin";
  compact?: boolean;
};

export function BrandMark({
  title = "Picki",
  subtitle,
  tone = "customer",
  compact = false,
}: BrandMarkProps) {
  return (
    <div className={`brand-mark brand-mark--${tone}${compact ? " brand-mark--compact" : ""}`}>
      <span className="brand-mark-icon" aria-hidden>
        <IconBrandPin />
      </span>
      <div className="brand-mark-text">
        <div className="logo">{title}</div>
        {subtitle ? <div className="tagline">{subtitle}</div> : null}
      </div>
    </div>
  );
}
