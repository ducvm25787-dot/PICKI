"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../lib/api";
import { homePathForApp } from "../../../../lib/session-app";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("0908888003");
  const [code, setCode] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(e instanceof Error ? e.message : "Lỗi OTP");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const session = await api<{ app?: string }>("/auth/otp/verify", {
        method: "POST",
        body: JSON.stringify({ phone, code, app: "admin" }),
      });
      router.replace(homePathForApp(session.app, "/admin"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "OTP sai");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="logo admin-logo">Pickee Ops</div>
      <p className="tagline">Super Admin 0908888030 · City Hà Nội 0908888031 · Khu Kim Văn 0908888003</p>
      <div className="card">
        {step === "phone" ? (
          <>
            <div className="field">
              <label htmlFor="phone">Số điện thoại</label>
              <input
                id="phone"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                }}
              />
            </div>
            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <button type="button" className="btn admin-btn" disabled={loading} onClick={() => void requestOtp()}>
              Nhận OTP
            </button>
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="code">OTP</label>
              <input
                id="code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                }}
              />
            </div>
            {devOtp && <p className="stat">Dev OTP: {devOtp}</p>}
            {error && <p style={{ color: "crimson" }}>{error}</p>}
            <button type="button" className="btn admin-btn" disabled={loading} onClick={() => void verifyOtp()}>
              Vào Ops
            </button>
          </>
        )}
      </div>
    </div>
  );
}
