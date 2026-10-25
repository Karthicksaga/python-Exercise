import { useState } from "react";
import { api, setCSRF } from "./api";
import { codeProblem, phoneProblem } from "./validate";

// Mobile-number sign-in with a one-time code sent by SMS.
export default function PhoneLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function request(e: React.FormEvent) {
    e.preventDefault();
    const problem = phoneProblem(phone);
    if (problem) return setMsg(problem);
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ dev_code?: string }>("/auth/otp/request", { phone });
      setSent(true);
      setMsg(r.dev_code ? `Development code: ${r.dev_code}` : "We sent a 6-digit code by SMS.");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const problem = codeProblem(code);
    if (problem) return setMsg(problem);
    setBusy(true);
    try {
      const r = await api<{ csrf: string }>("/auth/otp/verify", { phone, code });
      setCSRF(r.csrf);
      onSignedIn();
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inset" onSubmit={sent ? verify : request} noValidate>
      <strong>Sign in with mobile number</strong>
      <label>
        Mobile number
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={10} required disabled={sent} aria-invalid={!!phone && !!phoneProblem(phone) && !sent} autoComplete="tel-national" />
      </label>
      {sent && (
        <label>
          6-digit code
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} required autoComplete="one-time-code" />
        </label>
      )}
      <button disabled={busy}>{sent ? "Verify and sign in" : "Send code"}</button>
      {sent && (
        <button type="button" className="text-button" onClick={() => { setSent(false); setCode(""); setMsg(""); }}>
          Use a different number
        </button>
      )}
      {msg && <p className={/valid|Enter|Incorrect|expired|Wait|blocked|invalid/i.test(msg) ? "field-error" : "muted"} role="status">{msg}</p>}
    </form>
  );
}
