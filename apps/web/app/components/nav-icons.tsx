/** Shared SVG nav / UI icons — Visual V1 (no emoji). */
type IconProps = { className?: string; title?: string };

const svgProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.85,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true as const,
};

export function IconHome(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <rect x="6" y="4.5" width="12" height="15" rx="2" />
      <path d="M9 4.5V3.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 3.5v1" />
      <path d="M9 11h6M9 14.5h4" />
    </svg>
  );
}

export function IconMe(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.5c1.2-3.2 3.4-4.8 6.5-4.8s5.3 1.6 6.5 4.8" />
    </svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16.5 16.5 3.5 3.5" />
    </svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M7 7h10l1 13H6L7 7Z" />
      <path d="M9 7V5.5A3 3 0 0 1 12 2.5 3 3 0 0 1 15 5.5V7" />
    </svg>
  );
}

export function IconPin(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M12 21s6-5.2 6-10.2A6 6 0 0 0 6 10.8C6 15.8 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.2" />
    </svg>
  );
}

export function IconClipboard(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <rect x="6" y="5" width="12" height="15" rx="2" />
      <path d="M9 5.5V4.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

export function IconDinner(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M5 20h14" />
      <path d="M7 20V10a5 5 0 0 1 10 0v10" />
      <path d="M9 10c0-2 1.5-3.5 3-3.5S15 8 15 10" />
    </svg>
  );
}

export function IconWalk(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="14" cy="5" r="2" />
      <path d="m8 21 2.5-6 2 2 2.5 4" />
      <path d="m11 13 2-4 3 2 2 5" />
    </svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M7 10a5 5 0 0 1 10 0c0 4 1.5 5.5 1.5 5.5H5.5S7 14 7 10Z" />
      <path d="M10.5 18.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

export function IconChat(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H11l-4 3v-3H7.5A2.5 2.5 0 0 1 5 13.5v-7Z" />
    </svg>
  );
}

export function IconWrench(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M14.5 6.5a3.5 3.5 0 0 0-4.9 4.9L4 17l3 3 5.6-5.6a3.5 3.5 0 0 0 4.9-4.9L15 12l-2.5-2.5 2-3Z" />
    </svg>
  );
}

export function IconLive(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="10" opacity="0.35" />
    </svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" />
    </svg>
  );
}

export function IconRoute(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="6.5" cy="6.5" r="2.2" />
      <circle cx="17.5" cy="17.5" r="2.2" />
      <path d="M8.5 7.5c4-1 5 3 3.5 5.5S9 16 11 17.5" />
    </svg>
  );
}

export function IconHistory(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2-5.2" />
      <path d="M4.5 5.5v3.5H8" />
      <path d="M12 8v4.5l3 1.5" />
    </svg>
  );
}

export function IconGift(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <rect x="4.5" y="10" width="15" height="10.5" rx="1.5" />
      <path d="M4.5 14h15M12 10v10.5" />
      <path d="M12 10c-2-3.5-5.5-3-5.5-1S9 11 12 10c2-3.5 5.5-3 5.5-1S15 11 12 10Z" />
    </svg>
  );
}

export function IconMap(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <path d="m4.5 7 5-2.5 5 2.5 5-2.5v12.5l-5 2.5-5-2.5-5 2.5V7Z" />
      <path d="M9.5 4.5v12.5M14.5 7v12.5" />
    </svg>
  );
}

export function IconUsers(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M3.5 18.5c.8-3 2.8-4.5 5.5-4.5s4.7 1.5 5.5 4.5" />
      <path d="M14 14.5c2 .2 3.6 1.3 4.3 4" />
    </svg>
  );
}

/** All local services — broader than a single wrench. */
export function IconServices(props: IconProps) {
  return (
    <svg {...svgProps} className={props.className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function IconBrandPin(props: IconProps) {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 32 32"
      className={props.className}
      aria-hidden
    >
      <rect width="32" height="32" rx="9" fill="currentColor" />
      <path
        fill="#fff"
        d="M16 6.5c-3.9 0-7 3.1-7 7 0 5.5 7 12.5 7 12.5s7-7 7-12.5c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
      />
    </svg>
  );
}
