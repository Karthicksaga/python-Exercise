import React, { useEffect, useId, useRef, useState } from "react";
import { api, APIError, setCSRF } from "./api";
import { codeProblem, phoneProblem } from "./validate";
import OtpInput from "./OtpInput";

// Mirrors otpRequest's minimum interval; backend rate limits remain authoritative.
const RESEND_SECONDS = 30;
export default function PhoneLogin({ onSignedIn, buttonLabel = "Send OTP" }: {
  onSignedIn: () => void; buttonLabel?: string;
}) {
  const id = useId();
  const phoneRef = useRef<HTMLInputElement>(null);
  const deadlines = useRef<Record<string, number>>({});
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [touched, setTouched] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0, Math.ceil(((deadlines.current[phone] || 0) - now) / 1000));
  const validation = touched ? phoneProblem(phone) : "";
  function cooldown() { deadlines.current[phone] = Date.now() + RESEND_SECONDS * 1000; setNow(Date.now()); }
  async function request() {
    if (busy || remaining || phoneProblem(phone)) return;
    setBusy("send"); setError(""); setNotice("");
    try {
      const r = await api<{ dev_code?: string }>("/auth/otp/request", { phone });
      cooldown(); setSent(true);
      if (r.dev_code) {
        setCode(r.dev_code);
        setDevCode(r.dev_code);
        setNotice(`OTP code: ${r.dev_code}`);
      } else {
        setCode("");
        setDevCode("");
        setNotice("We sent a 6-digit code by SMS.");
      }
    } catch (err) {
      const message = (err as Error).message;
      if (err instanceof APIError && err.status === 429 && message === "Wait 30 seconds before requesting another code") cooldown();
      setError(message);
    } finally { setBusy(null); }
  }
  async function verify() {
    if (busy || codeProblem(code)) return;
    setBusy("verify"); setError("");
    try {
      const r = await api<{ csrf: string }>("/auth/otp/verify", { phone, code });
      setCSRF(r.csrf); onSignedIn();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(null); }
  }
  return <form className="auth-phone" aria-busy={!!busy} noValidate onSubmit={(e: React.FormEvent) => { e.preventDefault(); void (sent ? verify() : request()); }}>
    {sent ? <>
      <div className="auth-verification-heading"><h3>Verify your mobile number</h3><p>Enter the code sent to <strong>+91 {phone}</strong></p></div>
      {devCode ? (
        <div
          className="auth-otp-banner"
          style={{
            background: "rgba(34, 197, 94, 0.12)",
            border: "1.5px solid #22c55e",
            borderRadius: "10px",
            padding: "10px 14px",
            marginBottom: "14px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "0.78rem", color: "#16a34a", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Your Login OTP
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, letterSpacing: "5px", color: "#15803d", margin: "4px 0" }}>
            {devCode}
          </div>
          <small style={{ color: "#4b5563", fontSize: "0.8rem" }}>
            Auto-filled. Tap verify below to sign in.
          </small>
        </div>
      ) : null}
      <OtpInput value={code} onChange={v => { setCode(v); setError(""); }} disabled={!!busy} invalid={!!error} describedBy={`${id}-message`} />
      <button className="button" disabled={!!busy || !!codeProblem(code)}>{busy === "verify" ? "Verifying…" : "Verify and Sign In"}</button>
      <button
        type="button"
        className="auth-link"
        style={{ fontSize: "0.85rem", marginTop: 4 }}
        disabled={!!busy}
        onClick={() => {
          setCode("123456");
          setDevCode("123456");
          setError("");
          setNotice("Using test code 123456");
        }}
      >
        Use test OTP (123456)
      </button>
      <div className="auth-resend">{remaining > 0 ? <span>Resend OTP in {remaining}s</span> : <button type="button" className="auth-link" disabled={!!busy} onClick={() => void request()}>{busy === "send" ? "Sending…" : "Resend OTP"}</button>}</div>
      <button type="button" className="auth-link" disabled={!!busy} onClick={() => {
        setSent(false); setCode(""); setDevCode(""); setError(""); setNotice("");
        requestAnimationFrame(() => phoneRef.current?.focus());
      }}>Change Mobile Number</button>
    </> : <>
      <label htmlFor={`${id}-phone`}>Mobile number</label>
      <div className="auth-phone-field"><span>+91</span><input ref={phoneRef} id={`${id}-phone`} type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={10}
        placeholder="Enter mobile number" value={phone} disabled={!!busy} aria-invalid={!!validation || !!error} aria-describedby={`${id}-message`}
        onBlur={() => setTouched(true)} onChange={e => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setTouched(true); setError(""); }} /></div>
      <div
        style={{
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px dashed #3b82f6",
          borderRadius: "8px",
          padding: "8px 12px",
          marginTop: "10px",
          marginBottom: "12px",
          fontSize: "0.82rem",
          color: "#1d4ed8",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>⚡</span>
        <span>Instant OTP active: code will be shown on screen upon sending (or use <strong>123456</strong>).</span>
      </div>
      <button className="button" disabled={!!busy || !!phoneProblem(phone) || remaining > 0}>{busy === "send" ? "Sending…" : remaining > 0 ? `Send OTP in ${remaining}s` : buttonLabel}</button>
    </>}
    <div id={`${id}-message`} aria-live="polite">{error || (!sent && validation) ? <p className="field-error" role="alert">{error || validation}</p> : notice ? <p className="auth-notice">{notice}</p> : null}</div>
  </form>;
}
