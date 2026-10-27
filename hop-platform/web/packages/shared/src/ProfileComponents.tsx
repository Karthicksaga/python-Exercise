import React, { ReactNode } from "react";
import {
  IconCamera,
  IconCar,
  IconCheck,
  IconChevronRight,
  IconFileText,
  IconGift,
  IconInfoCircle,
  IconLogout,
  IconPhone,
  IconRoad,
  IconShieldCheck,
  IconStar,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { PrivateImage, VerifyPhone } from "./TrustProfile";

export const avatarColors: Record<string, string> = {
  indigo: "#4f46e5",
  emerald: "#059669",
  rose: "#e11d48",
  amber: "#d97706",
  sky: "#0284c7",
  slate: "#475569",
};

/* ----------------------------------------------------
   1. ProfileHeader
   ---------------------------------------------------- */
export interface ProfileHeaderProps {
  name: string;
  phone?: string;
  email?: string;
  phoneVerified: boolean;
  memberSince: string;
  avatarColor: string;
  hasPhoto: boolean;
  accountId: string;
  photoRevision?: number;
  onColorChange: (color: string) => void;
  onPhotoClick?: () => void;
}

export function ProfileHeader({
  name,
  phone,
  email,
  phoneVerified,
  memberSince,
  avatarColor,
  hasPhoto,
  accountId,
  photoRevision = 0,
  onColorChange,
  onPhotoClick,
}: ProfileHeaderProps) {
  const displayEmail = email && !/\.invalid$/.test(email) ? email : "No email";
  const displayPhone = phone ? `+91 ${phone}` : "No mobile linked";

  return (
    <div className="profile-hero-card">
      <div className="profile-hero-content">
        {/* Avatar with Camera Overlay */}
        <div className="profile-avatar-wrap">
          <div
            className="profile-avatar-large"
            style={{ backgroundColor: avatarColors[avatarColor] || avatarColors.indigo }}
          >
            {hasPhoto ? (
              <PrivateImage
                accountId={accountId}
                revision={String(photoRevision)}
                alt={`${name}'s portrait`}
                className="profile-portrait-img"
              />
            ) : (
              <span className="profile-initial">{(name[0] || "?").toUpperCase()}</span>
            )}
          </div>
          {onPhotoClick && (
            <button
              type="button"
              className="avatar-photo-btn"
              onClick={onPhotoClick}
              aria-label="Change profile photo"
              title="Change profile photo"
            >
              <IconCamera size={14} />
            </button>
          )}
        </div>

        {/* User identification info */}
        <div className="profile-id-info">
          <h2 className="profile-name">{name}</h2>
          <p className="profile-contact-line">
            {displayPhone} · {displayEmail}
          </p>

          <div className="profile-pills-row">
            <span className={`pill-badge ${phoneVerified ? "badge-ok" : "badge-warn"}`}>
              {phoneVerified ? (
                <>
                  <IconCheck size={12} stroke={3} />
                  <span>Mobile verified</span>
                </>
              ) : (
                <span>Mobile not verified</span>
              )}
            </span>
            <span className="pill-badge badge-neutral">Member since {memberSince}</span>
          </div>

          {/* Color swatch picker */}
          <div className="profile-swatches swatches" role="group" aria-label="Avatar colour">
            {Object.entries(avatarColors).map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-label={`Select ${k} theme`}
                aria-pressed={avatarColor === k}
                className={`swatch-dot ${avatarColor === k ? "selected" : ""}`}
                style={{ backgroundColor: v, background: v }}
                onClick={() => onColorChange(k)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Decorative City Skyline Artwork */}
      <div className="profile-hero-art" aria-hidden="true">
        <svg
          viewBox="0 0 200 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="skyline-svg"
        >
          {/* Subtle Skyline Buildings */}
          <rect x="20" y="45" width="22" height="60" rx="3" fill="#cbd5e1" opacity="0.35" />
          <rect x="48" y="25" width="28" height="80" rx="4" fill="#94a3b8" opacity="0.3" />
          <rect x="82" y="55" width="20" height="50" rx="3" fill="#cbd5e1" opacity="0.4" />
          <rect x="108" y="35" width="32" height="70" rx="4" fill="#94a3b8" opacity="0.35" />
          <rect x="146" y="50" width="26" height="55" rx="3" fill="#cbd5e1" opacity="0.3" />
          {/* Trees */}
          <circle cx="15" cy="98" r="12" fill="#86efac" opacity="0.7" />
          <circle cx="180" cy="95" r="14" fill="#86efac" opacity="0.7" />
          {/* Modern Ride Car */}
          <g transform="translate(60, 68) scale(0.65)">
            <ellipse cx="60" cy="55" rx="55" ry="12" fill="#000000" opacity="0.08" />
            <path
              d="M10 40C12 25 24 16 38 15L75 14C88 14 98 22 104 35L112 42C118 43 120 48 120 52V58H4V50C4 45 6 41 10 40Z"
              fill="#ffffff"
              stroke="#64748b"
              strokeWidth="2"
            />
            <path
              d="M32 20L22 36H55V20H32Z"
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth="1.5"
            />
            <path
              d="M62 20V36H94L86 20H62Z"
              fill="#e2e8f0"
              stroke="#64748b"
              strokeWidth="1.5"
            />
            <circle cx="28" cy="58" r="11" fill="#334155" />
            <circle cx="28" cy="58" r="5" fill="#f8fafc" />
            <circle cx="92" cy="58" r="11" fill="#334155" />
            <circle cx="92" cy="58" r="5" fill="#f8fafc" />
            <rect x="106" y="44" width="8" height="4" rx="2" fill="#38bdf8" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ----------------------------------------------------
   2. ProfileStats
   ---------------------------------------------------- */
export interface ProfileStatsProps {
  tripsDriven: number;
  travelledKm: number;
  ratingAvg: number | null;
  ratingCount: number;
  rewardPoints: number;
}

export function ProfileStats({
  tripsDriven,
  travelledKm,
  ratingAvg,
  ratingCount,
  rewardPoints,
}: ProfileStatsProps) {
  const ratingLabel = ratingCount > 0 ? `★ ${ratingAvg?.toFixed(1)}` : "New";

  return (
    <div className="profile-stats-grid">
      {/* Trips driven */}
      <div className="stat-card">
        <div className="stat-card-icon" style={{ backgroundColor: "#e6f7f0", color: "#059669" }}>
          <IconCar size={20} />
        </div>
        <div className="stat-card-body">
          <strong className="stat-card-value">{tripsDriven}</strong>
          <span className="stat-card-label">Trips driven</span>
        </div>
      </div>

      {/* Travelled */}
      <div className="stat-card">
        <div className="stat-card-icon" style={{ backgroundColor: "#eff6ff", color: "#2563eb" }}>
          <IconRoad size={20} />
        </div>
        <div className="stat-card-body">
          <strong className="stat-card-value">{travelledKm} km</strong>
          <span className="stat-card-label">Travelled</span>
        </div>
      </div>

      {/* Rating */}
      <div className="stat-card">
        <div className="stat-card-icon" style={{ backgroundColor: "#fffbeb", color: "#d97706" }}>
          <IconStar size={20} />
        </div>
        <div className="stat-card-body">
          <strong className="stat-card-value">{ratingLabel}</strong>
          <span className="stat-card-label">Rating</span>
        </div>
      </div>

      {/* Reward points */}
      <div className="stat-card">
        <div className="stat-card-icon" style={{ backgroundColor: "#fdf4ff", color: "#a855f7" }}>
          <IconGift size={20} />
        </div>
        <div className="stat-card-body">
          <strong className="stat-card-value">{rewardPoints}</strong>
          <span className="stat-card-label">Reward points</span>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------
   3. SettingsCard & SettingsListItem
   ---------------------------------------------------- */
export interface SettingsCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function SettingsCard({ title, subtitle, icon, children, className = "" }: SettingsCardProps) {
  return (
    <div className={`settings-card ${className}`}>
      <div className="settings-card-header">
        {icon && <span className="settings-card-icon">{icon}</span>}
        <div>
          <h3 className="settings-card-title">{title}</h3>
          {subtitle && <p className="settings-card-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="settings-card-body">{children}</div>
    </div>
  );
}

export interface SettingsListItemProps {
  icon: ReactNode;
  title: string;
  description?: string;
  onClick?: () => void;
  danger?: boolean;
  actionNode?: ReactNode;
  className?: string;
}

export function SettingsListItem({
  icon,
  title,
  description,
  onClick,
  danger = false,
  actionNode,
  className = "",
}: SettingsListItemProps) {
  return (
    <div
      className={`settings-list-item ${danger ? "is-danger" : ""} ${onClick ? "is-clickable" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="settings-item-leading">
        <span className="settings-item-icon">{icon}</span>
        <div className="settings-item-text">
          <strong className="settings-item-title">{title}</strong>
          {description && <span className="settings-item-desc">{description}</span>}
        </div>
      </div>
      <div className="settings-item-trailing">
        {actionNode ? (
          actionNode
        ) : (
          <span className="settings-item-chevron">
            <IconChevronRight size={18} />
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------
   4. PersonalDetailsForm
   ---------------------------------------------------- */
export interface PersonalDetailsFormProps {
  name: string;
  phone: string;
  email: string;
  gender: string;
  birthDate: string | null;
  phoneVerified: boolean;
  companyName?: string;
  businessGstin?: string;
  costCentre?: string;
  workEmail?: string;
  defaultPayment?: string;
  defaultVehicle?: string;
  saving: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

export function PersonalDetailsForm({
  name,
  phone,
  email,
  gender,
  birthDate,
  phoneVerified,
  companyName = "",
  businessGstin = "",
  costCentre = "",
  workEmail = "",
  defaultPayment = "cash",
  defaultVehicle = "bike",
  saving,
  onSubmit,
}: PersonalDetailsFormProps) {
  const [editing, setEditing] = React.useState(false);
  const displayEmail = email && !/\.invalid$/.test(email) ? email : "";

  return (
    <div className="personal-details-card">
      <div className="personal-details-header">
        <div className="personal-details-title-wrap">
          <div className="details-header-icon">
            <IconUser size={20} />
          </div>
          <div>
            <h3 className="details-header-title">About you</h3>
            <p className="details-header-sub">
              Keep your information up to date. Some details may be verified before you can start driving.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary edit-toggle-btn"
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      <form onSubmit={onSubmit} className="personal-details-form">
        <div className="details-form-grid">
          {/* Full Name */}
          <div className="details-field">
            <label htmlFor="name-input">Full name</label>
            <input
              id="name-input"
              name="name"
              defaultValue={name}
              minLength={2}
              maxLength={80}
              required
              disabled={!editing}
              className={editing ? "" : "readonly-input"}
            />
          </div>

          {/* Mobile number */}
          <div className="details-field">
            <label htmlFor="phone-input">Mobile number</label>
            <div className="input-with-badge">
              <input
                id="phone-input"
                name="phone"
                defaultValue={phone}
                readOnly
                className="readonly-input"
                placeholder="10-digit number"
              />
              <span className={`field-badge ${phoneVerified ? "badge-verified" : "badge-unverified"}`}>
                {phoneVerified ? (
                  <>
                    <IconCheck size={12} stroke={3} />
                    <span>Verified</span>
                  </>
                ) : (
                  <span>Unverified</span>
                )}
              </span>
            </div>
          </div>

          {/* Email */}
          <div className="details-field">
            <label htmlFor="email-input">Email</label>
            <div className="input-with-action">
              <input
                id="email-input"
                value={displayEmail}
                placeholder="Not linked"
                readOnly
                className="readonly-input"
              />
              {!displayEmail && (
                <button
                  type="button"
                  className="link-btn-inline"
                  onClick={() => alert("Email management is handled by your sign-in provider.")}
                >
                  Link email
                </button>
              )}
            </div>
          </div>

          {/* Gender */}
          <div className="details-field">
            <label htmlFor="gender-select">Gender</label>
            <select
              id="gender-select"
              name="gender"
              defaultValue={gender || ""}
              disabled={!editing}
              className={editing ? "" : "readonly-input"}
            >
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Date of birth */}
          <div className="details-field full-width">
            <label htmlFor="dob-input">Date of birth</label>
            <input
              id="dob-input"
              type="date"
              name="birth_date"
              defaultValue={birthDate ?? ""}
              max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)}
              disabled={!editing}
              className={editing ? "" : "readonly-input"}
            />
          </div>
        </div>

        {/* Info banner */}
        <div className="details-info-banner">
          <IconInfoCircle size={18} className="info-icon" />
          <p>
            Your email and sign-in are managed by your sign-in provider. Gender and date of birth are optional and never shown to riders.
          </p>
        </div>

        {/* Business travel & Ride defaults accordion/section when editing */}
        {editing && (
          <div className="details-expanded-sections">
            <h4 className="expanded-title">Business travel (optional)</h4>
            <p className="expanded-desc">
              Saved on future trip statements. Existing statements keep their original details.
            </p>
            <div className="details-form-grid">
              <div className="details-field">
                <label>Company name</label>
                <input name="company_name" defaultValue={companyName} maxLength={160} />
              </div>
              <div className="details-field">
                <label>GSTIN</label>
                <input name="business_gstin" defaultValue={businessGstin} maxLength={15} placeholder="Optional" />
              </div>
              <div className="details-field">
                <label>Cost centre / project</label>
                <input name="cost_centre" defaultValue={costCentre} maxLength={160} />
              </div>
              <div className="details-field">
                <label>Work email</label>
                <input type="email" name="work_email" defaultValue={workEmail} maxLength={160} />
              </div>
            </div>

            <h4 className="expanded-title mt-4">Ride defaults</h4>
            <div className="details-form-grid">
              <div className="details-field">
                <label>Pay with</label>
                <select name="default_payment" defaultValue={defaultPayment}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="wallet">Hop wallet</option>
                </select>
              </div>
              <div className="details-field">
                <label>Usual ride</label>
                <select name="default_vehicle" defaultValue={defaultVehicle}>
                  <option value="bike">Bike</option>
                  <option value="auto">Auto-rickshaw</option>
                  <option value="mini">Mini cab</option>
                  <option value="sedan">Sedan</option>
                  <option value="suv">SUV</option>
                </select>
              </div>
            </div>

            <div className="details-actions">
              <button type="submit" className="button primary-btn" disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

/* ----------------------------------------------------
   5. VerifiedMobileCard
   ---------------------------------------------------- */
export interface VerifiedMobileCardProps {
  phone: string;
  verified: boolean;
  phoneLogin?: boolean;
  onVerified: () => void | Promise<void>;
  notify: (msg: string) => void;
  className?: string;
}

export function VerifiedMobileCard({
  phone,
  verified,
  phoneLogin = false,
  onVerified,
  notify,
  className = "",
}: VerifiedMobileCardProps) {
  const [expanded, setExpanded] = React.useState(!verified);

  return (
    <div className={`verified-mobile-card ${className}`}>
      <div className="verified-mobile-header">
        <div className="verified-mobile-icon-title">
          <div className={`mobile-status-icon ${verified ? "is-verified" : "is-unverified"}`}>
            {verified ? <IconShieldCheck size={20} /> : <IconPhone size={20} />}
          </div>
          <div>
            <h4 className="mobile-card-title">Verified mobile</h4>
            <p className="mobile-card-sub">
              {phone ? `+91 ${phone}` : "No mobile linked"} ·{" "}
              <span className={verified ? "text-verified font-semibold" : "text-unverified font-semibold"}>
                {verified ? "Verified" : "Verification needed"}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          className="button secondary edit-toggle-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Collapse" : verified ? "Change" : "Verify"}
        </button>
      </div>

      {expanded && (
        <div className="verified-mobile-body mt-3">
          <VerifyPhone
            initialPhone={phone}
            verified={verified}
            phoneLogin={phoneLogin}
            onVerified={async () => {
              await onVerified();
              setExpanded(false);
            }}
            notify={notify}
          />
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------
   6. AccountActions
   ---------------------------------------------------- */
export interface AccountActionsProps {
  onDownloadData: () => void;
  onSignOut: () => void;
  onDeleteAccount: () => void;
  deletionRequestedAt?: string | null;
  onCancelDeletion?: () => void;
  className?: string;
}

export function AccountActions({
  onDownloadData,
  onSignOut,
  onDeleteAccount,
  deletionRequestedAt,
  onCancelDeletion,
  className = "",
}: AccountActionsProps) {
  return (
    <div className={`account-actions-group ${className}`}>
      <SettingsListItem
        icon={<IconFileText size={20} />}
        title="Download my data"
        description="Profile, contacts, places, rides and wallet as JSON"
        onClick={onDownloadData}
      />

      <SettingsListItem
        icon={<IconLogout size={20} />}
        title="Sign out"
        description="End this session on this device"
        onClick={onSignOut}
      />

      <SettingsListItem
        icon={<IconTrash size={20} />}
        title="Delete my account"
        description="Permanently delete your account and all data"
        danger
        onClick={onDeleteAccount}
      />

      {deletionRequestedAt && (
        <div className="deletion-alert-box mt-3">
          <p>
            Deletion requested on {new Date(deletionRequestedAt).toLocaleDateString("en-IN")}.
            You can cancel anytime within 30 days.
          </p>
          {onCancelDeletion && (
            <button
              type="button"
              className="button secondary sm-btn mt-2"
              onClick={onCancelDeletion}
            >
              Cancel deletion
            </button>
          )}
        </div>
      )}
    </div>
  );
}

