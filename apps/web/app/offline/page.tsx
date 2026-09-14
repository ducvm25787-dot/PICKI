"use client";

import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="container">
      <div className="card" style={{ marginTop: 48, textAlign: "center" }}>
        <p style={{ fontSize: 48, margin: "0 0 12px" }}>📡</p>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Không có mạng</h1>
        <p className="stat" style={{ marginBottom: 20 }}>
          Picki cần kết nối để đặt món và cập nhật đơn. Thử lại khi có mạng.
        </p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Thử lại
        </button>
        <Link href="/" className="stat" style={{ display: "block", marginTop: 16 }}>
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
