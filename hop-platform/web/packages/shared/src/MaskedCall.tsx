import { useState } from "react";
import { t } from "./i18n";
import { api } from "./api";

// Number-masked calling: the server hands back a temporary proxy number, never the other party's real one.
export default function MaskedCall({ rideId, notify }: { rideId: string; notify: (s: string) => void }) {
  const [call, setCall] = useState<{ masked_number: string; expires_at: string; simulated?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    try {
      setCall(await api(`/api/rides/${rideId}/call`, {}));
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (call) {
    return (
      <div className="masked-call" role="status">
        <a href={`tel:${call.masked_number.replace(/\s/g, "")}`} className="call-link">📞 {call.masked_number}</a>
        <small>Private number — your real number stays hidden. Valid for 10 minutes{call.simulated ? " (simulated in development)" : ""}.</small>
      </div>
    );
  }
  return (
    <button type="button" className="secondary call-btn" disabled={busy} onClick={start}>
      📞 {t("call.secure")}
    </button>
  );
}
