"use client";

import type { ReactNode } from "react";

export function OrderNumberHeading({
  orderNumber,
  providerBrandName,
  right,
  as = "strong",
}: {
  orderNumber: string;
  providerBrandName?: string | null;
  right?: ReactNode;
  as?: "strong" | "h1";
}) {
  const Tag = as;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
      <div>
        <Tag style={as === "h1" ? { fontSize: 22, margin: "0 0 4px" } : undefined}>{orderNumber}</Tag>
        {providerBrandName ? (
          <p className="stat" style={{ margin: as === "h1" ? "0 0 4px" : "2px 0 0", fontSize: 13 }}>
            {providerBrandName}
          </p>
        ) : null}
      </div>
      {right}
    </div>
  );
}
