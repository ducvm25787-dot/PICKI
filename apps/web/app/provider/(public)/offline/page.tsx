"use client";

import Link from "next/link";

export default function ProviderOfflinePage() {
  return (
    <div className="container provider-container">
      <div className="card" style={{ marginTop: 48, textAlign: "center" }}>
        <p style={{ fontSize: 48, margin: "0 0 12px" }}>📡</p>
        <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Không có mạng</h1>
        <p className="stat" style={{ marginBottom: 20 }}>
          Pickee Provider cần kết nối để nhận và cập nhật đơn. Thử lại khi có mạng.
        </p>
        <button
          type="button"
          className="btn provider-btn"
          onClick={() => {
            window.location.reload();
          }}
        >
          Thử lại
        </button>
        <Link href="/provider" className="stat" style={{ display: "block", marginTop: 16 }}>
          Về trang đơn hàng
        </Link>
      </div>
    </div>
  );
}
