"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../../lib/api";
import { P6CartNote } from "../../../../components/p6-cart-note";

type ClusterCard = {
  id: string;
  name: string;
  slug: string;
  stallCount: number;
  groups: string[];
  imageUrl: string | null;
};

export default function MarketClustersPage() {
  const slug = useParams<{ slug: string }>().slug;
  const [clusters, setClusters] = useState<ClusterCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ clusters: ClusterCard[] }>(`/zones/${slug}/market/clusters`)
      .then((res) => setClusters(res.clusters))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Không tải được"));
  }, [slug]);

  return (
    <div className="container">
      <Link href={`/zones/${slug}/market`} className="stat" style={{ display: "inline-block", marginBottom: 8 }}>
        ← Đi chợ
      </Link>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        Chợ
      </h1>
      <p className="stat">Mua đủ đồ tươi từ nhiều quầy trong một lần</p>
      <P6CartNote />
      {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      {clusters.length === 0 && !error ? <p className="stat">Chưa có chợ đang mở trong Zone.</p> : null}
      <div style={{ display: "grid", gap: 12 }}>
        {clusters.map((cluster) => (
          <Link key={cluster.id} href={`/zones/${slug}/market/clusters/${cluster.slug}`} className="card">
            <div
              aria-hidden
              style={{
                height: 72,
                borderRadius: 12,
                marginBottom: 10,
                background: "var(--surface-2, #f3f1ea)",
                display: "grid",
                placeItems: "center",
                fontSize: 28,
              }}
            >
              {cluster.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cluster.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                "🥬"
              )}
            </div>
            <strong>{cluster.name}</strong>
            <p className="stat" style={{ margin: "4px 0 0" }}>
              {cluster.groups.length > 0 ? cluster.groups.join(" · ") : "Chưa có quầy"}
            </p>
            <p className="stat" style={{ margin: "2px 0 0" }}>
              {cluster.stallCount} quầy
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
