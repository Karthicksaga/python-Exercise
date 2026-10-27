import HopCirclePanel from "./HopCirclePanel";
import { IconBell, IconCar, IconCopy, IconUsers, IconWheelchair, IconEar, IconEye, IconAccessible, IconTypography } from "@tabler/icons-react";
import "./safety-dashboard.css";
import { serverURL } from "@hop/shared/platform";
import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { applyLargeText, languages, setLang, t, useLang } from "@hop/shared/i18n";
import type { Ride, SavedLocation } from "@hop/shared/types";

type Prefs = {
  language: string;
  wheelchair_access: boolean;
  hearing_impaired: boolean;
  visually_impaired: boolean;
  extra_assistance: boolean;
  large_text: boolean;
  notifications_enabled: boolean;
};
type Companion = {
  preferences: Prefs;
  notifications: { id: string; title: string; body: string; read_at: string | null; created_at: string }[];
  referral: { code: string; points: number; referred: number; redeemed: boolean }[];
  rewards: { points: number; reason: string; created_at: string }[];
  family: { id: string; status: string; role: "owner" | "member"; name: string; email: string }[];
  favorite_drivers: { id: string; name: string; vehicle_number: string }[];
  scheduled_rides: { id: string; category: string; pickup_label: string; dropoff_label: string; scheduled_for: string; status: string }[];
  lost_items: { id: string; description: string; status: string; created_at: string }[];
};

const toggles: [keyof Prefs, string][] = [
  ["wheelchair_access", "Wheelchair-accessible vehicle needed"],
  ["hearing_impaired", "I am deaf or hard of hearing"],
  ["visually_impaired", "I am blind or have low vision"],
  ["extra_assistance", "Driver assistance getting in and out"],
  ["large_text", "Larger text"],
  ["notifications_enabled", "In-app notifications"],
];

export default function CompanionPanel({
  rides,
  circleEnabled=false,
  saved,
  notify,
}: {
  circleEnabled?: boolean;
  rides: Ride[];
  saved: SavedLocation[];
  notify: (s: string) => void;
}) {
  useLang();
  const [data, setData] = useState<Companion | null>(null);
  const [shareLink, setShareLink] = useState("");
  const [loadError, setLoadError] = useState("");
  const load = useCallback(
    () => api<Companion>("/api/companion").then((d) => { setLoadError(""); setData(d); setLang(d.preferences.language); applyLargeText(d.preferences.large_text); }).catch((e: Error) => { setLoadError(e.message); notify(e.message); }),
    [notify],
  );
  useEffect(() => {
    load();
  }, [load]);
  const run = async (path: string, body: unknown, done?: string) => {
    try {
      const out = await api<Record<string, string>>(path, body);
      if (done) notify(done);
      await load();
      return out;
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (!data) return <section className="safety-dashboard"><section className="safety-card" role="status">{loadError ? <><p>{loadError}</p><button onClick={load}>Try again</button></> : "Loading your safety settings…"}</section></section>;

  const mine = rides.filter((r) => r.mine);
  const activeRide = mine.find((r) => ["accepted", "arrived", "in_progress"].includes(r.status));
  const ended = mine.filter((r) => r.status === "completed");
  const ref = data.referral[0];
  const unread = data.notifications.filter((n) => !n.read_at).length;
  const savePrefs = (patch: Partial<Prefs>) =>
    run("/api/preferences", { ...data.preferences, ...patch }, "Preferences saved");

  const form = (handler: (f: FormData, el: HTMLFormElement) => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handler(new FormData(e.currentTarget), e.currentTarget);
  };

  return (
    <div className="safety-dashboard">
      {activeRide && (
        <section className="safety-card safety-wide" aria-label="Safety">
          <p className="eyebrow">SAFETY</p>
          <h2>Active ride safety</h2>
          <p className="muted">
            SOS alerts hop operators with your ride and location. It does not contact police — in an
            emergency call <strong>112</strong>.
          </p>
          <div className="row">
            <button
              className="danger sos"
              onClick={() => {
                if (!confirm("Send an SOS alert to hop operators?")) return;
                const send = (lat?: number, lng?: number) =>
                  run(`/api/rides/${activeRide.id}/sos`, lat === undefined ? {} : { lat, lng }, "SOS sent. Call 112 if you are in danger.");
                navigator.geolocation
                  ? navigator.geolocation.getCurrentPosition(
                      (p) => send(p.coords.latitude, p.coords.longitude),
                      () => send(),
                      { timeout: 4000 },
                    )
                  : send();
              }}
            >
              {t("more.sos")}
            </button>
            <button
              onClick={async () => {
                const out = await run(`/api/rides/${activeRide.id}/share`, {});
                if (out?.path) setShareLink(new URL(serverURL(out.path), location.origin).href);
              }}
            >
              {t("more.share")}
            </button>
            <button className="text-button" onClick={() => { setShareLink(""); run(`/api/rides/${activeRide.id}/share/revoke`, {}, "Sharing stopped"); }}>
              Stop sharing
            </button>
          </div>
          {shareLink && (
            <p>
              Anyone with this link can follow your trip for 6 hours:
              <br />
              <input readOnly value={shareLink} onFocus={(e) => e.currentTarget.select()} />
            </p>
          )}
        </section>
      )}

      <section className="safety-card safety-inbox">
        <p className="eyebrow">NOTIFICATIONS {unread > 0 && `· ${unread} NEW`}</p>
        <h2>{t("more.inbox")}</h2>
        <p className="muted">Ride updates, safety alerts and important account information, all in one place.</p>
        {data.notifications.length === 0 ? <div className="safety-empty safety-bell"><IconBell size={42} stroke={1.4} aria-hidden="true" /><div><h3>You're all caught up!</h3><p>New notifications will appear here.</p></div></div> : <ul className="plain safety-notifications">
          {data.notifications.map(n => <li key={n.id} data-unread={!n.read_at}>
            <span className="safety-read-dot" aria-label={n.read_at ? "Read" : "Unread"} />
            <div><strong>{n.title}</strong><p>{n.body}</p><time dateTime={n.created_at}>{new Date(n.created_at).toLocaleString()}</time></div>
          </li>)}
        </ul>}
        {unread > 0 && <button onClick={() => run("/api/notifications/read", {})}>Mark all read</button>}

      </section>

      <section className="safety-card">
        <p className="eyebrow">PREFERENCES</p>
        <h2>{t("more.prefs")}</h2>
        <p className="muted">Make every ride more comfortable. Your preferences stay with your account.</p>
        <label className="safety-language">
          Language
          <select value={data.preferences.language} onChange={(e) => savePrefs({ language: e.target.value })}>
            {languages.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </label>
        <fieldset className="safety-preferences"><legend>Accessibility & notifications</legend>
        {toggles.map(([key, label], index) => (
          <label key={key} className="check">
            <input type="checkbox" checked={data.preferences[key] as boolean} onChange={(e) => savePrefs({ [key]: e.target.checked })} />
            <span className="safety-pref-icon" aria-hidden="true">{(() => { const Glyph = [IconWheelchair, IconEar, IconEye, IconAccessible, IconTypography, IconBell][index]; return <Glyph size={19} />; })()}</span>
            <span>{label}</span>
          </label>
        ))}
        </fieldset>
        <p className="muted safety-footnote">Navigation, booking and safety labels are translated into Hindi, Tamil, Telugu, Kannada and Malayalam; other languages show English for now.</p>
      </section>

      <section className="safety-card">
        <p className="eyebrow">REWARDS</p>
        <h2>Refer & earn</h2>
        <div className="safety-referral-summary">
          <div className="safety-code"><span>Your referral code</span><div><strong>{ref?.code || "Unavailable"}</strong><button type="button" aria-label="Copy referral code" disabled={!ref?.code} onClick={async () => {
            try { await navigator.clipboard.writeText(ref!.code); notify("Referral code copied"); } catch { notify("Could not copy the code. Please select and copy it manually."); }
          }}><IconCopy size={19} /></button></div></div>
          <dl><div><dt>Points earned</dt><dd>{ref?.points ?? 0}</dd></div><div><dt>Friends referred</dt><dd>{ref?.referred ?? 0}</dd></div></dl>
        </div>
        <p className="muted">You and your friend each earn 100 points when they complete their first ride.</p>
        {!ref?.redeemed && (
          <form className="row" onSubmit={form((f, el) => { void run("/api/referrals/redeem", { code: f.get("code") }, "Referral applied").then(out => { if (out) el.reset(); }); })}>
            <input aria-label="Friend's referral code" name="code" placeholder="Friend's code" maxLength={8} required />
            <button>Apply</button>
          </form>
        )}
        <ul className="plain">
          {data.rewards.map((r, i) => (
            <li key={i}>+{r.points} · {r.reason}</li>
          ))}
        </ul>
      </section>

      <section className="safety-card">
        <p className="eyebrow">FAMILY</p>
        <h2>Family account</h2>
        <p className="muted">Invite family members to manage rides together.</p>
        {data.family.length === 0 && <div className="safety-empty"><IconUsers size={32} aria-hidden="true" /><p>Your family starts here. Invite someone you trust.</p></div>}
        <ul className="plain">
          {data.family.map((m) => (
            <li key={m.id}>
              {m.name} ({m.role === "owner" ? "member" : "organiser"}) · {m.status}{" "}
              {m.status === "pending" && m.role === "member" && (
                <>
                  <button onClick={() => run(`/api/family/${m.id}/respond`, { accept: true }, "Joined")}>Accept</button>{" "}
                  <button className="text-button" onClick={() => run(`/api/family/${m.id}/respond`, { accept: false })}>Decline</button>
                </>
              )}
              {m.status === "accepted" && (
                <button className="text-button" onClick={() => run(`/api/family/${m.id}/delete`, {}, "Removed")}>Remove</button>
              )}
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={form((f, el) => { void run("/api/family/invite", { email: f.get("email") }, "Invitation sent").then(out => { if (out) el.reset(); }); })}>
          <input aria-label="Family member email" name="email" type="email" placeholder="Their registered email" required />
          <button>Invite</button>
        </form>
      </section>

      {circleEnabled ? <section className="safety-card"><HopCirclePanel rides={rides}/></section> : <>
      <section className="safety-card">
        <p className="eyebrow">FAVORITES</p>
        <h2>Favorite drivers</h2>
        {data.favorite_drivers.length === 0 && <div className="safety-empty"><IconCar size={36} aria-hidden="true" /><div><h3>No favorite drivers yet</h3><p>Add a driver after a completed ride.</p></div></div>}
        <ul className="plain">
          {data.favorite_drivers.map((d) => (
            <li key={d.id}>
              {d.name} · {d.vehicle_number}{" "}
              <button className="text-button" onClick={() => run(`/api/favorite-drivers/${d.id}/delete`, {})}>Remove</button>
            </li>
          ))}
        </ul>
        {ended.length > 0 && (
          <form className="row" onSubmit={form((f) => run("/api/favorite-drivers", { ride_id: f.get("ride") }, "Added to favorites"))}>
            <select name="ride">
              {ended.map((r) => (
                <option key={r.id} value={r.id}>{r.driver_name} · {r.vehicle_number} ({r.dropoff_label})</option>
              ))}
            </select>
            <button>Add favorite</button>
          </form>
        )}
        <p className="muted">Your favorite drivers are offered your rides first, for a short while.</p>
      </section>

      </>}

      <section className="safety-card">
        <p className="eyebrow">SCHEDULED</p>
        <h2>Scheduled rides</h2>
        <ul className="plain">
          {data.scheduled_rides.map((s) => (
            <li key={s.id}>
              {new Date(s.scheduled_for).toLocaleString()} · {s.category} · {s.pickup_label} → {s.dropoff_label} · {s.status}{" "}
              {s.status === "scheduled" && (
                <button className="text-button" onClick={() => run(`/api/scheduled-rides/${s.id}/cancel`, {}, "Cancelled")}>Cancel</button>
              )}
            </li>
          ))}
        </ul>
        {saved.length < 2 ? (
          <p className="muted">Save at least two places (Profile or Book a ride) to schedule between them.</p>
        ) : (
          <form
            onSubmit={form((f, el) => {
              const from = saved.find((l) => l.id === f.get("from"));
              const to = saved.find((l) => l.id === f.get("to"));
              if (!from || !to || from.id === to.id) return notify("Choose two different saved places");
              run(
                "/api/scheduled-rides",
                {
                  category: f.get("category"),
                  pickup_lat: from.lat, pickup_lng: from.lng, pickup_label: from.place_label,
                  dropoff_lat: to.lat, dropoff_lng: to.lng, dropoff_label: to.place_label,
                  scheduled_for: new Date(String(f.get("when"))).toISOString(),
                },
                "Ride scheduled",
              );
              el.reset();
            })}
          >
            <label>From<select name="from">{saved.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
            <label>To<select name="to">{saved.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
            <label>Vehicle
              <select name="category">
                {["bike", "auto", "mini", "sedan", "suv"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>When<input name="when" type="datetime-local" required /></label>
            <button>Schedule</button>
          </form>
        )}
        <p className="muted">
          We request a driver for you automatically at pickup time.
        </p>
      </section>

      <section className="safety-card">
        <p className="eyebrow">LOST ITEM</p>
        <h2>Report a lost item</h2>
        {ended.length === 0 ? (
          <p className="muted">Available after a completed ride.</p>
        ) : (
          <form onSubmit={form((f, el) => { run(`/api/rides/${f.get("ride")}/lost-items`, { description: f.get("description") }, "Report sent to support"); el.reset(); })}>
            <select name="ride">
              {ended.map((r) => (
                <option key={r.id} value={r.id}>{r.dropoff_label} · {new Date(r.created_at).toLocaleDateString()}</option>
              ))}
            </select>
            <textarea name="description" placeholder="What did you leave behind?" minLength={5} maxLength={1000} required />
            <button>Submit</button>
          </form>
        )}
        <ul className="plain">
          {data.lost_items.map((l) => (
            <li key={l.id}>{l.description} · {l.status}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
