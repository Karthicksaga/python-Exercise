import { useState, type ReactNode } from "react";
import PageLoader from "./PageLoader";
import Icon from "./Icons";
import AuthCard from "./AuthCard";
import VehicleArt from "./VehicleArt";

export interface LandingVehicleItem {
  id: string;
  name: string;
  note?: string;
}

export interface LandingPerkItem {
  icon?: string | ReactNode;
  title: string;
  subtitle?: string;
  description: string;
}

export interface LandingStepItem {
  title: string;
  description: string;
}

export interface AppLandingProps {
  mode: "rider" | "captain";
  phoneLogin: boolean;
  tagline?: string;
  heroTitle?: string;
  heroAccent?: string;
  heroDescription?: string;
  trustBadges?: Array<{ icon?: string; label: string }>;
  cardEyebrow?: string;
  cardTitle?: string;
  cardFinePrint?: string;
  accountLoginUrl?: string;
  accountLoginLabel?: string;
  onSignedIn?: () => void;
  vehiclesSectionTitle?: string;
  vehicles?: LandingVehicleItem[];
  perks?: LandingPerkItem[];
  stepsSectionTitle?: string;
  steps?: LandingStepItem[];
  className?: string;
}

const RIDER_DEFAULTS = {
  tagline: "Everyday rides, made simple",
  heroTitle: "Your next stop.",
  heroAccent: "A simpler ride.",
  heroDescription:
    "Choose a bike, auto or cab. Review your fare, confirm your pickup and follow your trip in the app.",
  trustBadges: [
    { icon: "shield", label: "Verified drivers" },
    { icon: "tag", label: "Fare estimates" },
    { icon: "pin", label: "Trip tracking" },
  ],
  cardEyebrow: "Welcome to hop",
  cardTitle: "Sign in to ride",
  cardFinePrint: "Sign in to book and manage your rides.",
  accountLoginUrl: "/auth/login",
  accountLoginLabel: "Continue with your account",
  vehiclesSectionTitle: "Find a ride for your day",
  vehicles: [
    { id: "bike", name: "Bike", note: "Beat the traffic" },
    { id: "auto", name: "Auto", note: "Everyday city hops" },
    { id: "mini", name: "Mini cab", note: "Compact AC" },
    { id: "sedan", name: "Sedan", note: "Comfort for 4" },
    { id: "suv", name: "SUV", note: "Room for 6" },
  ],
  perks: [
    {
      icon: "tag",
      title: "Clear fare estimates",
      description: "Review the route and estimated fare before requesting a ride.",
    },
    {
      icon: "shield",
      title: "Verified drivers",
      description: "Checked drivers and vehicles, a pickup PIN and one-tap SOS.",
    },
    {
      icon: "wallet",
      title: "Payment options",
      description: "Choose from the payment options available for your trip.",
    },
  ] as LandingPerkItem[],
  stepsSectionTitle: "How it works",
  steps: [
    { title: "Set your trip", description: "Pick a pickup and drop, or just say it aloud." },
    { title: "Choose a ride", description: "Compare bikes, autos and cabs. Negotiate if you like." },
    { title: "Ride and track", description: "Follow your driver live and share your trip." },
  ],
};

const CAPTAIN_DEFAULTS = {
  tagline: "hop Captain",
  heroTitle: "Your day.",
  heroAccent: "Your next ride.",
  heroDescription:
    "Go online, review nearby ride requests and manage your trips with tools built for your day on the road.",
  trustBadges: [
    { icon: "shield", label: "100% fare retention" },
    { icon: "ride", label: "Direct ride matching" },
    { icon: "pin", label: "Zero commission" },
  ],
  cardEyebrow: "Captain sign in",
  cardTitle: "Sign in to drive",
  cardFinePrint: "New here? Sign in, then apply to drive.",
  accountLoginUrl: "/auth/login",
  accountLoginLabel: "Continue with your account",
  vehiclesSectionTitle: "Supported vehicle categories",
  vehicles: [
    { id: "bike", name: "Bike", note: "Fast city trips" },
    { id: "auto", name: "Auto", note: "Everyday city hops" },
    { id: "mini", name: "Mini cab", note: "Compact AC" },
    { id: "sedan", name: "Sedan", note: "Comfort for 4" },
    { id: "suv", name: "SUV", note: "Room for 6" },
  ],
  perks: [
    {
      icon: "ride",
      title: "Your time",
      subtitle: "Choose when to drive",
      description: "Go online when you’re ready and offline when you need a break.",
    },
    {
      icon: "vehicle",
      title: "Your choice",
      subtitle: "Review ride requests",
      description: "Check the pickup, destination and fare before accepting.",
    },
    {
      icon: "earnings",
      title: "One place",
      subtitle: "Keep track of trips",
      description: "View your trip history and earnings in the app.",
    },
  ],
  stepsSectionTitle: "How to get started",
  steps: [
    { title: "Sign in to your account", description: "Use your existing account or mobile number" },
    { title: "Add your documents", description: "Upload your licence, RC and insurance" },
    { title: "Get approved", description: "We’ll verify your details and notify you" },
    { title: "Go online and drive", description: "Start accepting rides and earn" },
  ],
};

/**
 * Reusable, responsive Landing component for Rider and Captain.
 * Fully adapts from 320px mobile up to ultrawide desktop screens.
 */
export default function AppLanding({
  mode,
  phoneLogin,
  tagline,
  heroTitle,
  heroAccent,
  heroDescription,
  trustBadges,
  cardEyebrow,
  cardTitle,
  cardFinePrint,
  accountLoginUrl,
  accountLoginLabel,
  onSignedIn,
  vehiclesSectionTitle,
  vehicles,
  perks,
  stepsSectionTitle,
  steps,
  className = "",
}: AppLandingProps) {
  const [going, setGoing] = useState("");
  const defaults = mode === "captain" ? CAPTAIN_DEFAULTS : RIDER_DEFAULTS;

  const resolvedTagline = tagline ?? defaults.tagline;
  const resolvedHeroTitle = heroTitle ?? defaults.heroTitle;
  const resolvedHeroAccent = heroAccent ?? defaults.heroAccent;
  const resolvedHeroDesc = heroDescription ?? defaults.heroDescription;
  const resolvedTrust = trustBadges ?? defaults.trustBadges;
  const resolvedCardEyebrow = cardEyebrow ?? defaults.cardEyebrow;
  const resolvedCardTitle = cardTitle ?? defaults.cardTitle;
  const resolvedCardFinePrint = cardFinePrint ?? defaults.cardFinePrint;
  const resolvedLoginUrl = accountLoginUrl ?? defaults.accountLoginUrl;
  const resolvedLoginLabel = accountLoginLabel ?? defaults.accountLoginLabel;
  const resolvedVehiclesTitle = vehiclesSectionTitle ?? defaults.vehiclesSectionTitle;
  const resolvedVehicles = vehicles ?? defaults.vehicles;
  const resolvedPerks = perks ?? defaults.perks;
  const resolvedStepsTitle = stepsSectionTitle ?? defaults.stepsSectionTitle;
  const resolvedSteps = steps ?? defaults.steps;

  const handleSignIn = () => {
    setGoing("Signing you in…");
    if (onSignedIn) {
      onSignedIn();
    } else {
      window.location.reload();
    }
  };

  return (
    <div className={`lp lp-${mode} ${className}`}>
      {going && <PageLoader overlay label={going} />}

      {/* 1. Hero Section */}
      <section className="lp-hero">
        <div className="lp-copy">
          <span className="chip">{resolvedTagline}</span>
          <h1>
            {resolvedHeroTitle}
            <br />
            <em>{resolvedHeroAccent}</em>
          </h1>
          <p className="intro-copy">{resolvedHeroDesc}</p>
          {resolvedTrust && resolvedTrust.length > 0 && (
            <ul className="lp-trust">
              {resolvedTrust.map((item, idx) => (
                <li key={idx}>
                  {item.icon && <Icon name={item.icon} size={18} />}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sign In Card */}
        <AuthCard
          mode={mode}
          accentColor={mode === "captain" ? "gold" : "coral"}
          title={resolvedCardTitle}
          eyebrow={resolvedCardEyebrow}
          finePrint={resolvedCardFinePrint}
          accountLoginUrl={resolvedLoginUrl}
          accountLoginLabel={resolvedLoginLabel}
          phoneLogin={phoneLogin}
          onAccountLogin={() => setGoing("Taking you to sign in…")}
          onSignedIn={handleSignIn}
        />
      </section>

      {/* 2. Vehicles / Fleet Section */}
      {resolvedVehicles && resolvedVehicles.length > 0 && (
        <section className="lp-section">
          <h2>{resolvedVehiclesTitle}</h2>
          <div className="lp-rides">
            {resolvedVehicles.map((v) => (
              <div className="lp-ride" key={v.id}>
                <VehicleArt category={v.id} width={96} />
                <b>{v.name}</b>
                {v.note && <small>{v.note}</small>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Perks Section */}
      {resolvedPerks && resolvedPerks.length > 0 && (
        <section className="lp-section">
          <div className="lp-perks">
            {resolvedPerks.map((p: LandingPerkItem, idx) => (
              <div className="lp-perk" key={idx}>
                <span className="lp-ico">
                  {typeof p.icon === "string" ? <Icon name={p.icon} size={22} /> : p.icon}
                </span>
                <h3>{p.title}</h3>
                {p.subtitle && (
                  <strong style={{ display: "block", marginBottom: 4, fontSize: 14 }}>
                    {p.subtitle}
                  </strong>
                )}
                <p>{p.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. How It Works Section */}
      {resolvedSteps && resolvedSteps.length > 0 && (
        <section className="lp-section lp-how">
          <h2>{resolvedStepsTitle}</h2>
          <ol>
            {resolvedSteps.map((s, i) => (
              <li key={i}>
                <span className="lp-num">{i + 1}</span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
