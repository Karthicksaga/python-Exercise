import { useState } from "react";
import { api } from "./api";
import { downloadPDF } from "./platform";

export default function TripReceipt({ rideId, notify }: { rideId: string; notify: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const out = await api<{ pdf: string; filename: string }>(`/api/rides/${rideId}/receipt`);
      await downloadPDF(out.pdf, out.filename);
    } catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="trust-block"><button type="button" className="secondary" disabled={busy} onClick={() => void download()}>{busy ? "Preparing PDF…" : "Download trip statement (PDF)"}</button><small className="muted">For expense claims. Shows payment status; this is not a GST tax invoice.</small></div>;
}
