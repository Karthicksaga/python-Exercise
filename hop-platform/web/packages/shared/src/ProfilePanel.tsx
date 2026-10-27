import { MediaUpload } from "./TrustProfile";
import { serverFetch, isAndroid, nativeExport } from "./platform";
import React, { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { getLang, languages, setLang } from "./i18n";
import type { SavedLocation } from "./types";
import {
  ProfileHeader,
  ProfileStats,
  PersonalDetailsForm,
  VerifiedMobileCard,
  SettingsCard,
  SettingsListItem,
  AccountActions,
} from "./ProfileComponents";
import {
  IconBell,
  IconHelp,
  IconLanguage,
  IconPlus,
  IconSettings,
  IconShieldLock,
  IconSwitchHorizontal,
  IconX,
} from "@tabler/icons-react";

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
  indigo: "#4f46e5",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
  sky: "#0284c7",
  slate: "#475569",
};

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
  const [photoRevision, setPhotoRevision] = useState(0);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
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

  useEffect(() => {
    void load();
  }, [load]);

  if (!profile) return <section className="panel" role="status">Loading profile…</section>;

  const d = profile.details[0];
  const s = profile.stats[0];
  const since = new Date(d.created_at).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
  const verified = d.phone_verified;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const out = await api<{ name: string }>("/api/profile", {
        name: f.get("name"),
        company_name: f.get("company_name"),
        business_gstin: f.get("business_gstin"),
        cost_centre: f.get("cost_centre"),
        work_email: f.get("work_email"),
        gender: f.get("gender"),
        birth_date: f.get("birth_date"),
        default_payment: f.get("default_payment"),
        default_vehicle: f.get("default_vehicle"),
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
    if (isAndroid) {
      await nativeExport(await res.json());
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "hop-my-data.json",
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deletion(cancel: boolean) {
    if (
      !cancel &&
      !confirm(
        "Request account deletion? Our team processes it after a 30-day window; you can cancel any time before then."
      )
    ) {
      return;
    }
    try {
      await api("/api/profile/deletion", { cancel });
      await load();
      p.notify(
        cancel ? "Deletion cancelled. Welcome back!" : "Deletion requested. You can cancel within 30 days."
      );
    } catch (err) {
      p.notify((err as Error).message);
    }
  }

  return (
    <div className="captain-profile-page">
      {/* 60% Left / 40% Right Two-Column Layout */}
      <div className="profile-two-column-layout">
        {/* ====================================================
            LEFT COLUMN (60%): Header, Stats, Details, Contacts
            ==================================================== */}
        <div className="profile-main-col">
          {/* 1. ProfileHeader */}
          <ProfileHeader
            name={d.name}
            phone={d.phone}
            email={d.email}
            phoneVerified={verified}
            memberSince={since}
            avatarColor={d.avatar_color}
            hasPhoto={d.has_photo}
            accountId={d.id}
            photoRevision={photoRevision}
            onColorChange={color}
            onPhotoClick={() => setPhotoModalOpen(true)}
          />

          {/* 2. ProfileStats */}
          <ProfileStats
            tripsDriven={s.drives_completed || 0}
            travelledKm={Number((s.meters / 1000).toFixed(0))}
            ratingAvg={s.rating_avg}
            ratingCount={s.rating_count}
            rewardPoints={s.reward_points || 0}
          />

          {/* 3. PersonalDetailsForm */}
          <PersonalDetailsForm
            name={d.name}
            phone={d.phone}
            email={d.email}
            gender={d.gender}
            birthDate={d.birth_date}
            phoneVerified={verified}
            companyName={d.company_name}
            businessGstin={d.business_gstin}
            costCentre={d.cost_centre}
            workEmail={d.work_email}
            defaultPayment={d.default_payment}
            defaultVehicle={d.default_vehicle}
            saving={saving}
            onSubmit={save}
          />

          {/* 4. Verified Mobile Card */}
          <VerifiedMobileCard
            phone={d.phone}
            verified={d.phone_verified}
            phoneLogin={d.phone_login}
            onVerified={load}
            notify={p.notify}
          />

          {/* 5. Emergency Contacts */}
          <section className="panel profile-contacts-section">
            <div className="section-title-wrap">
              <p className="eyebrow">SAFETY & TRUST</p>
              <h3>Emergency contacts</h3>
              <p className="muted text-xs">People you trust. Add up to 5 so you can reach them quickly if needed.</p>
            </div>

            <ul className="rows contacts-list mt-3">
              {profile.contacts.length === 0 && (
                <li className="muted text-sm py-2">No emergency contacts saved yet.</li>
              )}
              {profile.contacts.map((c) => (
                <li key={c.id} className="contact-item-row">
                  <span className="avatar sm">{(c.name[0] || "?").toUpperCase()}</span>
                  <div className="contact-info">
                    <b>{c.name}</b>
                    <small>{c.relation ? c.relation + " · " : ""}+91 {c.phone}</small>
                  </div>
                  <div className="contact-actions">
                    <a className="button secondary sm-btn" href={`tel:+91${c.phone}`}>Call</a>
                    <button type="button" className="text-button danger sm-btn" onClick={() => void removeContact(c)}>Remove</button>
                  </div>
                </li>
              ))}
            </ul>

            {profile.contacts.length < 5 && (
              <form className="grid-3 contact-add-form mt-4" onSubmit={addContact}>
                <input
                  placeholder="Name"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  minLength={2}
                  maxLength={60}
                  required
                />
                <input
                  placeholder="Mobile"
                  value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  required
                />
                <input
                  placeholder="Relation (optional)"
                  value={contact.relation}
                  onChange={(e) => setContact({ ...contact, relation: e.target.value })}
                  maxLength={30}
                />
                <button type="submit" className="button secondary inline-flex items-center gap-1">
                  <IconPlus size={16} />
                  <span>Add contact</span>
                </button>
              </form>
            )}
          </section>

          {/* 6. Saved Places (for rider convenience) */}
          {p.saved.length > 0 && (
            <section className="panel profile-places-section">
              <p className="eyebrow">PLACES</p>
              <h3>Saved places</h3>
              <ul className="rows mt-2">
                {p.saved.map((l) => (
                  <li key={l.id} className="place-item-row">
                    <span className="place-ico">{kindIcon[l.kind] ?? "★"}</span>
                    <div>
                      <b>{l.label}</b>
                      <small>{l.place_label}</small>
                    </div>
                    <button type="button" className="text-button danger" onClick={() => p.onDeleteSaved(l)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ====================================================
            RIGHT COLUMN (40%): Settings, Rider Mode, Privacy
            ==================================================== */}
        <div className="profile-side-col">
          {/* 1. App settings Card */}
          <SettingsCard title="App settings" icon={<IconSettings size={18} />}>
            <SettingsListItem
              icon={<IconLanguage size={20} />}
              title="Language & preferences"
              description="Language, region and app display"
              onClick={() => {
                const currentIndex = languages.findIndex(([c]) => c === lang);
                const nextLang = languages[(currentIndex + 1) % languages.length];
                setLang(nextLang[0]);
                setLangState(nextLang[0]);
                p.notify(`Language changed to ${nextLang[1]}`);
              }}
              actionNode={
                <select
                  value={lang}
                  onChange={(e) => {
                    setLang(e.target.value);
                    setLangState(e.target.value);
                  }}
                  className="settings-lang-select"
                  onClick={(e) => e.stopPropagation()}
                >
                  {languages.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              }
            />

            <SettingsListItem
              icon={<IconBell size={20} />}
              title="Accessibility & notifications"
              description="Wheelchair access, hearing, large text, alerts"
              onClick={() => p.goTo(p.role === "captain" ? "driver" : "more")}
            />

            <SettingsListItem
              icon={<IconHelp size={20} />}
              title="Help & support"
              description="Complaints, lost items, ride issues"
              onClick={() => p.goTo("support")}
            />
          </SettingsCard>

          {/* 2. Rider Mode Card */}
          <div className="rider-mode-card">
            <div className="rider-mode-header">
              <div className="rider-mode-icon-title">
                <IconSwitchHorizontal size={20} className="text-amber-700" />
                <strong>Rider Mode</strong>
              </div>
              <a
                href={import.meta.env.VITE_RIDER_URL || "http://localhost:5273"}
                className="button secondary switch-rider-btn"
              >
                Switch to Rider App
              </a>
            </div>
            <p className="rider-mode-desc">Need to take a ride? Switch back to the Rider app.</p>
          </div>

          {/* 3. Privacy & account Card */}
          <SettingsCard title="Privacy & account" icon={<IconShieldLock size={18} />}>
            <AccountActions
              onDownloadData={() => void download()}
              onSignOut={p.logout}
              onDeleteAccount={() => void deletion(false)}
              deletionRequestedAt={d.deletion_requested_at}
              onCancelDeletion={() => void deletion(true)}
            />
          </SettingsCard>
        </div>
      </div>

      {/* Profile Photo Modal */}
      {photoModalOpen && (
        <div className="hop-modal-overlay" onClick={() => setPhotoModalOpen(false)}>
          <div className="hop-modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="hop-modal-header">
              <h3>Profile Photo</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPhotoModalOpen(false)}
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="hop-modal-body">
              <p className="muted text-sm mb-3">
                {p.role === "captain"
                  ? "Use a clear, front-facing portrait. Changing it pauses new captain assignments until operator review."
                  : "Optional. Your photo is stored privately."}
              </p>
              <MediaUpload
                endpoint="/api/profile/photo"
                label={d.has_photo ? "Replace profile photo" : "Add profile photo"}
                portrait
                onSaved={async () => {
                  setPhotoRevision((v) => v + 1);
                  setPhotoModalOpen(false);
                  await load();
                }}
                notify={p.notify}
              />
              {d.has_photo && p.role !== "captain" && !p.driving && (
                <button
                  type="button"
                  className="text-button danger mt-3"
                  onClick={() => {
                    void api("/api/profile/photo/delete", {})
                      .then(async () => {
                        setPhotoModalOpen(false);
                        await load();
                      })
                      .catch((e) => p.notify(e.message));
                  }}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
