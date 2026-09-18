"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiUnreachableError } from "../../lib/api";
import { BrandMark } from "../components/brand-mark";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("0901234567");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState<boolean | null>(null);

  useEffect(() => {
    void api<{ status: string }>("/health")
      .then(() => setApiReady(true))
      .catch(() => setApiReady(false));
  }, []);

  function formatError(e: unknown) {
    if (e instanceof ApiUnreachableError) return e.message;
    return e instanceof Error ? e.message : "Có lỗi xảy ra";
  }

  async function requestOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ devOtp?: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      if (res.devOtp) {
        setDevOtp(res.devOtp);
        setCode(res.devOtp);
      }
      setStep("otp");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      await api("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code, app: "customer" }),
      });
      router.replace("/");
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div style={{ marginBottom: 28 }}>
        <BrandMark subtitle="Đăng nhập để khám phá khu của bạn" />
      </div>

      {apiReady === false && (
        <div
          className="card"
          style={{ marginBottom: 16, background: "#fff8f0", borderColor: "#f5c89a" }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600 }}>API chưa sẵn sàng</p>
          <p className="stat" style={{ margin: 0 }}>
            &quot;Ready&quot; của Next.js ≠ API. Chạy trong terminal:
          </p>
          <pre
            style={{
              margin: "12px 0 0",
              padding: 12,
              background: "#1a1a1a",
              color: "#f7f5f2",
              borderRadius: 8,
              fontSize: 13,
              overflowX: "auto",
            }}
          >
            {`bash scripts/start-local.sh`}
          </pre>
        </div>
      )}

      <div className="card">
        {step === "phone" ? (
          <>
            <div className="field">
              <label htmlFor="phone">Số điện thoại</label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0901234567"
              />
            </div>
            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <button type="button" className="btn" disabled={loading} onClick={() => void requestOtp()}>
              {loading ? "Đang gửi…" : "Nhận mã OTP"}
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="code">Mã OTP</label>
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6 số"
              />
            </div>
            {devOtp && (
              <p className="stat" style={{ marginBottom: 12 }}>
                Dev OTP: <strong>{devOtp}</strong>
              </p>
            )}
            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <button type="button" className="btn" disabled={loading} onClick={() => void verifyOtp()}>
              {loading ? "Đang xác thực…" : "Vào Pickee"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
