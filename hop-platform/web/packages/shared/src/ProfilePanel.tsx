import { MediaUpload, PrivateImage, VerifyPhone } from "./TrustProfile";
import { serverFetch, isAndroid, nativeExport } from "./platform";
import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { getLang, languages, setLang } from "./i18n";
import { money, type SavedLocation } from "./types";

export type ProfileDetails = {
  id: string;
  phone_verified: boolean;
  has_photo: boolean;
  photo_approved: boolean;
  company_name: string;
  business_gstin: string;
  cost_centre: string;
  work_email: string;
  name: string;
  email: string;
  phone_login: boolean;
  created_at: string;
  phone: string;
  gender: string;
  birth_date: string | null;
  avatar_color: string;
  default_payment: string;
  default_vehicle: string;
  deletion_requested_at: string | null;
};
type Stats = {
  rides_taken: number;
  rides_cancelled: number;
  spent_paise: number;
  meters: number;
  rating_avg: number | null;
  rating_count: number;
  wallet_paise: number;
  reward_points: number;
  drives_completed: number;
  saved_places: number;
};
type Contact = { id: string; name: string; phone: string; relation: string };
type Profile = { details: ProfileDetails[]; stats: Stats[]; contacts: Contact[] };

export const avatarColors: Record<string, string> = {
  indigo: "#4f46e5", emerald: "#059669", rose: "#e11d48", amber: "#d97706", sky: "#0284c7", slate: "#475569",
};
const vehicles: [string, string][] = [["", "Ask me each time"], ["bike", "Bike"], ["auto", "Auto-rickshaw"], ["mini", "Mini cab"], ["sedan", "Sedan"], ["suv", "SUV"]];
const kindIcon: Record<string, string> = { home: "🏠", work: "💼", favorite: "★" };

type Props = {
  name: string;
  driving: boolean;
  saved: SavedLocation[];
  busy: boolean;
  role?: "rider" | "captain";
  notify: (m: string) => void;
  onName: (name: string) => void;
  onDetails: (d: ProfileDetails) => void;
  onDeleteSaved: (l: SavedLocation) => void;
  goTo: (tab: string) => void;
  becomeDriver: () => void;
  logout: () => void;
};

export default function ProfilePanel(p: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoRevision,setPhotoRevision]=useState(0);
  const [contact, setContact] = useState({ name: "", phone: "", relation: "" });
  const [lang, setLangState] = useState(getLang());

  const load = useCallback(async () => {
    try {
      const out = await api<Profile>("/api/profile");
      setProfile(out);
      p.onDetails(out.details[0]);
    } catch (e) {
      p.notify((e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!profile) return <section className="panel">Loading…</section>;
  const d = profile.details[0];
  const s = profile.stats[0];
  const since = new Date(d.created_at).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const verified = d.phone_verified;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const out = await api<{ name: string }>("/api/profile", {
        name: f.get("name"), company_name: f.get("company_name"), business_gstin: f.get("business_gstin"), cost_centre: f.get("cost_centre"), work_email: f.get("work_email"), gender: f.get("gender"), birth_date: f.get("birth_date"),
        default_payment: f.get("default_payment"), default_vehicle: f.get("default_vehicle"),
      });
      p.onName(out.name);
      p.notify("Your profile was updated.");
      await load();
    } catch (err) {
      p.notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function color(c: string) {
    try {
      await api("/api/profile", { name: d.name, avatar_color: c });
      await load();
    } catch (err) {
      p.notify((err as Error).message);
    }
  }
  async function addContact(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api("/api/profile/contacts", contact);
      setContact({ name: "", phone: "", relation: "" });
      await load();
      p.notify("Emergency contact saved.");
    } catch (err) {
      p.notify((err as Error).message);
    }
  }
  async function removeContact(c: Contact) {
    try {
      await api(`/api/profile/contacts/${c.id}/delete`, {});
      await load();
    } catch (err) {
      p.notify((err as Error).message);
    }
  }
  async function download() {
    const res = await serverFetch("/api/profile/export", { credentials: "same-origin" });
    if (!res.ok) return p.notify("Could not export your data right now.");
    if (isAndroid) { await nativeExport(await res.json()); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: "hop-my-data.json" });
    a.click();
    URL.revokeObjectURL(url);
  }
  async function deletion(cancel: boolean) {
    if (!cancel && !confirm("Request account deletion? Our team processes it after a 30-day window; you can cancel any time before then.")) return;
    try {
      await api("/api/profile/deletion", { cancel });
      await load();
      p.notify(cancel ? "Deletion cancelled. Welcome back!" : "Deletion requested. You can cancel within 30 days.");
    } catch (err) {
      p.notify((err as Error).message);
    }
  }

  return (
    <div className="profile-grid">
      <section className="panel profile-hero">
        <span className="avatar xl" style={{ background: avatarColors[d.avatar_color] }}>{d.has_photo ? <PrivateImage accountId={d.id} revision={String(photoRevision)} alt="Your profile" className="captain-portrait" /> : (d.name[0] || "?").toUpperCase()}</span>
        <div className="profile-id">
          <h2>{d.name}</h2>
          <p className="muted">{d.phone ? `+91 ${d.phone}` : "Add your mobile number"} · {/\.invalid$/.test(d.email) ? "No email" : d.email}</p>
          <div className="badges">
            <span className={"pill " + (verified ? "ok" : "warn")}>{verified ? "✓ Mobile verified" : d.phone ? "Mobile added · not verified" : "Add your mobile"}</span>
            <span className="pill">Member since {since}</span>
            {s.rating_count > 0 && <span className="pill">★ {s.rating_avg?.toFixed(2)} ({s.rating_count})</span>}
          </div>
          <div className="swatches" role="group" aria-label="Avatar colour">
            {Object.entries(avatarColors).map(([k, v]) => (
              <button key={k} type="button" aria-label={k} aria-pressed={d.avatar_color === k} className={d.avatar_color === k ? "on" : ""} style={{ background: v }} onClick={() => void color(k)} />
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <VerifyPhone initialPhone={d.phone} verified={d.phone_verified} phoneLogin={d.phone_login} onVerified={load} notify={p.notify} />
        <h3>Profile photo</h3>
        <p className="muted">{p.role === "captain" ? "Use a clear, front-facing portrait. Changing it pauses new captain assignments until operator review; finish active trips first." : "Optional. Your photo is stored privately."}</p>
        <MediaUpload endpoint="/api/profile/photo" label={d.has_photo ? "Replace profile photo" : "Add profile photo"} portrait onSaved={async () => {setPhotoRevision(v=>v+1);await load();}} notify={p.notify} />
        {d.has_photo && p.role !== "captain" && !p.driving && <button type="button" className="text-button" onClick={() => {void api("/api/profile/photo/delete",{}).then(load).catch(e=>p.notify(e.message));}}>Remove photo</button>}
        {p.role === "captain" && d.has_photo && <p className="pill">{d.photo_approved ? "Portrait approved" : "Portrait awaiting review"}</p>}
      </section>

      {p.role === "captain" ? (
        <section className="profile-stats">
          <div><b>{s.drives_completed}</b><span>Trips driven</span></div>
          <div><b>{(s.meters / 1000).toFixed(0)} km</b><span>Travelled</span></div>
          <div><b>{s.rating_count > 0 ? `★ ${s.rating_avg?.toFixed(1)}` : "New"}</b><span>Rating</span></div>
          <div><b>{s.reward_points}</b><span>Reward points</span></div>
        </section>
      ) : (
        <section className="profile-stats">
          <div><b>{s.rides_taken}</b><span>Rides taken</span></div>
          <div><b>{(s.meters / 1000).toFixed(0)} km</b><span>Travelled</span></div>
          <div><b>{money(s.spent_paise)}</b><span>Total spent</span></div>
          <div><b>{money(s.wallet_paise)}</b><span>Wallet</span></div>
          <div><b>{s.reward_points}</b><span>Reward points</span></div>
        </section>
      )}

      <section className="panel">
        <p className="eyebrow">PERSONAL DETAILS</p>
        <h3>About you</h3>
        <form onSubmit={save} key={d.name + d.phone + d.gender + d.birth_date}>
          <div className="grid-2">
            <label>Full name<input name="name" defaultValue={d.name} minLength={2} maxLength={80} required /></label>
            <label>Mobile number
              <input name="phone" defaultValue={d.phone} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} placeholder="10-digit number" readOnly />
            </label>
            <label>Email<input value={/\.invalid$/.test(d.email) ? "" : d.email} placeholder="Not linked" readOnly /></label>
            <label>Gender
              <select name="gender" defaultValue={d.gender}>
                <option value="">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>Date of birth<input type="date" name="birth_date" defaultValue={d.birth_date ?? ""} max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)} /></label>
          </div>
          <p className="muted">Your email and sign-in are managed by your sign-in provider. Gender and date of birth are optional and never shown to drivers.</p>
          <h4>Business travel (optional)</h4>
          <p className="muted">Saved on future trip statements. Existing statements keep their original details. Employer claim approval and tax eligibility are separate.</p>
          <div className="grid-2">
            <label>Company name<input name="company_name" defaultValue={d.company_name} maxLength={160} /></label>
            <label>GSTIN<input name="business_gstin" defaultValue={d.business_gstin} maxLength={15} placeholder="Optional" /></label>
            <label>Cost centre / project<input name="cost_centre" defaultValue={d.cost_centre} maxLength={160} /></label>
            <label>Work email<input type="email" name="work_email" defaultValue={d.work_email} maxLength={160} /></label>
          </div>
          <h4>Ride defaults</h4>
          <div className="grid-2">
            <label>Pay with
              <select name="default_payment" defaultValue={d.default_payment}>
                <option value="cash">Cash</option><option value="upi">UPI</option><option value="wallet">Hop wallet</option>
              </select>
            </label>
            <label>Usual ride
              <select name="default_vehicle" defaultValue={d.default_vehicle}>
                {vehicles.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          </div>
          <button disabled={saving || p.busy}>Save changes</button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">SAFETY</p>
        <h3>Emergency contacts</h3>
        <p className="muted">People you trust. Add up to 5 so you can reach them quickly when something feels wrong.</p>
        <ul className="rows">
          {profile.contacts.length === 0 && <li className="muted">No contacts yet.</li>}
          {profile.contacts.map((c) => (
            <li key={c.id}>
              <span className="avatar sm">{c.name[0].toUpperCase()}</span>
              <div><b>{c.name}</b><small>{c.relation ? c.relation + " · " : ""}+91 {c.phone}</small></div>
              <a className="text-button" href={`tel:+91${c.phone}`}>Call</a>
              <button type="button" className="text-button danger" onClick={() => void removeContact(c)}>Remove</button>
            </li>
          ))}
        </ul>
        {profile.contacts.length < 5 && (
          <form className="grid-3" onSubmit={addContact}>
            <input placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} minLength={2} maxLength={60} required />
            <input placeholder="Mobile" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value.replace(/\D/g, "") })} inputMode="numeric" pattern="[6-9][0-9]{9}" maxLength={10} required />
            <input placeholder="Relation (optional)" value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} maxLength={30} />
            <button className="secondary">Add contact</button>
          </form>
        )}
        <p className="muted">Contacts are stored for your reference. Hop does not message them automatically yet.</p>
      </section>

      <section className="panel">
        <p className="eyebrow">PLACES</p>
        <h3>Saved places</h3>
        <ul className="rows">
          {p.saved.length === 0 && <li className="muted">Save Home or Work from the booking screen for one-tap trips.</li>}
          {p.saved.map((l) => (
            <li key={l.id}>
              <span className="place-ico">{kindIcon[l.kind] ?? "★"}</span>
              <div><b>{l.label}</b><small>{l.place_label}</small></div>
              <button type="button" className="text-button danger" onClick={() => p.onDeleteSaved(l)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <p className="eyebrow">APP</p>
        <h3>Language & preferences</h3>
        <label>Language
          <select value={lang} onChange={(e) => { setLang(e.target.value); setLangState(e.target.value); }}>
            {languages.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <div className="link-rows">
          <button type="button" onClick={() => p.goTo(p.role === "captain" ? "driver" : "more")}><b>Accessibility & notifications</b><small>Wheelchair access, hearing, large text, alerts</small></button>
          {p.role !== "captain" && (
            <button type="button" onClick={() => p.goTo("wallet")}><b>Wallet & promo codes</b><small>Balance {money(s.wallet_paise)}</small></button>
          )}
          <button type="button" onClick={() => p.goTo("support")}><b>Help & support</b><small>Complaints, lost items, ride issues</small></button>
        </div>
      </section>

      {p.role === "captain" ? (
        <section className="panel become-driver inset approved">
          <div>
            <strong>Rider Mode</strong>
            <p className="muted">Need to take a ride? Switch back to the Rider app.</p>
          </div>
          <a
            href={import.meta.env.VITE_RIDER_URL || "https://hop-staging-rider-qp262su4sq-el.a.run.app"}
            className="secondary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "10px 16px", borderRadius: 12, fontWeight: 700 }}
          >
            Switch to Rider App
          </a>
        </section>
      ) : p.driving ? (
        <section className="panel become-driver inset approved">
          <div>
            <strong>Drive with Hop (Captain Mode)</strong>
            <p className="muted">Your application is approved. Switch to Captain to start driving.</p>
          </div>
          <button type="button" className="secondary" onClick={p.becomeDriver}>Switch to Drive Mode</button>
        </section>
      ) : (
        <section className="panel become-driver inset">
          <div>
            <strong>Drive with Hop</strong>
            <p className="muted">Register your vehicle and apply to drive with Hop.</p>
          </div>
          <button type="button" className="secondary" onClick={p.becomeDriver}>Become a driver</button>
        </section>
      )}

      <section className="panel">
        <p className="eyebrow">PRIVACY & ACCOUNT</p>
        <h3>Your data</h3>
        <div className="link-rows">
          <button type="button" onClick={() => void download()}><b>Download my data</b><small>Profile, contacts, places, rides and wallet as JSON</small></button>
          <button type="button" onClick={p.logout}><b>Sign out</b><small>End this session on this device</small></button>
        </div>
        {d.deletion_requested_at ? (
          <div className="alert">
            Deletion requested on {new Date(d.deletion_requested_at).toLocaleDateString("en-IN")}. Our team processes deletion requests after a 30-day window.{" "}
            <button type="button" className="text-button" onClick={() => void deletion(true)}>Cancel deletion</button>
          </div>
        ) : (
          <button type="button" className="danger-outline" onClick={() => void deletion(false)}>Delete my account</button>
        )}
      </section>
    </div>
  );
}
