import { useEffect, useRef, useState } from "react";
import { api } from "./api";

export function PrivateImage({ accountId, kind, alt, className = "", revision = "" }: { accountId: string; kind?: string; alt: string; className?: string; revision?: string }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    let current = true; setSource("");
    const path = kind ? `/api/drivers/documents/${accountId}/${kind}` : `/api/profile/photo/${accountId}`;
    void api<{ image: string; content_type: string }>(path).then(r => { if (current) setSource(`data:${r.content_type};base64,${r.image}`); }).catch(() => {});
    return () => { current = false; };
  }, [accountId, kind, revision]);
  return source ? <img className={className} src={source} alt={alt} style={{ maxWidth: "100%", objectFit: "cover" }} /> : <span className={className} aria-label={`${alt} unavailable`}>Photo unavailable</span>;
}

export function VerifyPhone({ initialPhone = "", verified, phoneLogin = false, onVerified, notify }: { initialPhone?: string; verified: boolean; phoneLogin?: boolean; onVerified: () => void | Promise<void>; notify: (s: string) => void }) {
  const [phone, setPhone] = useState(initialPhone), [code, setCode] = useState("");
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [cooldown, setCooldown] = useState(0), [devCode, setDevCode] = useState("");
  useEffect(() => { setPhone(initialPhone); setSent(false); setCode(""); }, [initialPhone]);
  useEffect(() => { if (!cooldown) return; const t = setTimeout(() => setCooldown(v => Math.max(0, v - 1)), 1000); return () => clearTimeout(t); }, [cooldown]);
  async function request() {
    setBusy(true);
    try {
      const out = await api<{ dev_code?: string; retry_after: number }>("/api/profile/phone/request", { phone });
      setSent(true); setCode(out.dev_code || ""); setDevCode(out.dev_code || ""); setCooldown(out.retry_after || 30);
      notify(out.dev_code ? `Test code: ${out.dev_code}` : "Verification code sent. It expires in 10 minutes.");
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true);
    try { await api("/api/profile/phone/verify", { phone, code }); setSent(false); setCode(""); setDevCode(""); await onVerified(); notify("Mobile number verified."); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  const unchanged = verified && phone === initialPhone;
  return <div className="trust-block">
    <h3>Verified mobile</h3>
    <p className="muted">Verify ownership before booking or driving. Your current verified number remains active while a replacement is being verified.</p>
    <label>Mobile number<input aria-label="Mobile to verify" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} maxLength={10} readOnly={phoneLogin} onChange={e => { setPhone(e.target.value.replace(/\D/g, "")); setSent(false); setCode(""); setDevCode(""); }} /></label>
    {unchanged ? <p className="pill ok">Mobile ownership verified</p> : <button type="button" disabled={busy || cooldown > 0 || !/^[6-9]\d{9}$/.test(phone)} onClick={() => void request()}>{cooldown ? `Resend in ${cooldown}s` : sent ? "Resend code" : "Send verification code"}</button>}
    {phoneLogin && <small className="muted">Contact support to change your sign-in number.</small>}
    {sent && <div>
      <label>6-digit verification code<input aria-label="Mobile verification code" value={code} autoComplete="one-time-code" inputMode="numeric" maxLength={6} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} /></label>
      {devCode && <p className="muted" style={{ fontWeight: 600, color: "var(--brand)" }}>Test verification code: <span style={{ letterSpacing: "2px", fontWeight: 800 }}>{devCode}</span></p>}
      <button type="button" disabled={busy || code.length !== 6} onClick={() => void verify()}>Verify mobile</button>
    </div>}
  </div>;
}

async function imagePayload(file: File, portrait: boolean): Promise<string> {
  if (!/^image\/(jpeg|png)$/.test(file.type) || file.size > 12 * 1024 * 1024) throw new Error("Choose a JPEG or PNG image up to 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 64 || bitmap.height < 64) throw new Error("Choose a clearer image at least 64 pixels wide and high.");
    const canvas = document.createElement("canvas");
    const size = portrait ? Math.min(bitmap.width, bitmap.height) : 0;
    const scale = Math.min(1, (portrait ? 640 : 1600) / (portrait ? size : Math.max(bitmap.width, bitmap.height)));
    canvas.width = Math.round((portrait ? size : bitmap.width) * scale); canvas.height = Math.round((portrait ? size : bitmap.height) * scale);
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image processing is unavailable on this device.");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, portrait ? (bitmap.width - size) / 2 : 0, portrait ? (bitmap.height - size) / 2 : 0, portrait ? size : bitmap.width, portrait ? size : bitmap.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
  } finally { bitmap.close(); }
}

export function MediaUpload({ endpoint, label, portrait = false, onSaved, notify }: { endpoint: string; label: string; portrait?: boolean; onSaved: () => void | Promise<void>; notify: (s: string) => void }) {
  const [busy, setBusy] = useState(false), [preview, setPreview] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function choose(file?: File) {
    if (!file) return; setBusy(true);
    try { const data = await imagePayload(file, portrait); setPreview(data); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function upload() {
    setBusy(true);
    try { await api(endpoint, { image: preview }); setPreview(""); await onSaved(); notify("Image uploaded privately."); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="trust-upload">
    <label>{label}<input ref={input} type="file" accept="image/jpeg,image/png" disabled={busy} onChange={e => void choose(e.target.files?.[0])} /></label>
    <small className="muted">JPEG or PNG. {portrait ? "A square centre crop is shown below before saving." : "Keep all text and document edges readable."} Image metadata is removed.</small>
    {preview && <div><img src={`data:image/jpeg;base64,${preview}`} alt={`${label} preview`} style={{ maxWidth: portrait ? 160 : 300, maxHeight: 260, objectFit: "contain" }} /><div className="actions"><button type="button" disabled={busy} onClick={() => void upload()}>{busy ? "Uploading…" : "Save image"}</button><button className="secondary" type="button" disabled={busy} onClick={() => setPreview("")}>Discard</button></div></div>}
    {busy && <p role="status">Processing image…</p>}
  </div>;
}
