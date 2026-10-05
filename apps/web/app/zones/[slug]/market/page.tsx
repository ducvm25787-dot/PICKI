"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { P6CartNote } from "../../../components/p6-cart-note";

export default function MarketChooserPage() {
  const slug = useParams<{ slug: string }>().slug;
  return (
    <div className="container">
      <Link href="/" className="stat" style={{ display: "inline-block", marginBottom: 8 }}>
        ← Trang chủ
      </Link>
      <h1 className="page-title" style={{ marginTop: 0 }}>
        Đi chợ
      </h1>
      <P6CartNote />
      <div style={{ display: "grid", gap: 12 }}>
        <Link href={`/zones/${slug}/market/clusters`} className="card" style={{ display: "block" }}>
          <p className="section-title" style={{ marginBottom: 6 }}>
            🥬 Chợ
          </p>
          <p style={{ margin: 0 }}>Mua đủ đồ tươi từ nhiều quầy trong một lần</p>
        </Link>
        <Link href={`/zones/${slug}/market/stores`} className="card" style={{ display: "block" }}>
          <p className="section-title" style={{ marginBottom: 6 }}>
            🏪 Cửa hàng
          </p>
          <p style={{ margin: 0 }}>Mua trực tiếp từ cửa hàng chuyên bạn tin dùng</p>
        </Link>
      </div>
    </div>
  );
}
