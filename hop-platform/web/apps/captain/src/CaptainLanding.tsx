import { useState } from "react";
import PageLoader from "@hop/shared/PageLoader";
import PhoneLogin from "@hop/shared/PhoneLogin";
import VehicleArt from "@hop/shared/VehicleArt";

const vehicles: [string, string][] = [["bike", "Bike"], ["auto", "Auto"], ["mini", "Mini cab"], ["sedan", "Sedan"], ["suv", "SUV"]];
const perks: [string, string, string][] = [
  ["Your time", "Choose when to drive", "Go online when you’re ready and offline when you need a break."],
  ["Your choice", "Review ride requests", "Check the pickup, destination and fare before accepting."],
  ["One place", "Keep track of trips", "View your trip history and earnings in the app."],
];
const steps = ["Sign in to your account", "Add your licence, RC and insurance", "Get approved, go online and drive"];

export default function CaptainLanding({ phoneLogin }: { phoneLogin: boolean }) {
  const [going, setGoing] = useState("");
  return (
    <div className="cl">
      <section className="cl-hero">
        <div className="cl-copy">
          <span className="cl-tag">hop Captain</span>
          <h1>Your day.<br /><em>Your next ride.</em></h1>
          <p>Go online, review nearby ride requests and manage your trips with tools built for your day on the road.</p>
          <div className="cl-fleet">
            {vehicles.map(([id, name]) => (
              <div key={id}><VehicleArt category={id} width={64} /><small>{name}</small></div>
            ))}
          </div>
        </div>
        {going && <PageLoader overlay label={going} />}
        <div className="cl-card">
          <span className="cl-tag dark">Captain sign in</span>
          <h2>Sign in to drive</h2>
          <a className="button full" href="/auth/login" onClick={() => setGoing("Taking you to sign in…")}>Continue with your account</a>
          {phoneLogin && (
            <>
              <div className="lp-or"><span>or</span></div>
              <PhoneLogin onSignedIn={() => { setGoing("Signing you in…"); window.location.reload(); }} />
            </>
          )}
          <p className="lp-fine">New here? Sign in, then apply to drive.</p>
        </div>
      </section>
      <section className="cl-perks">
        {perks.map(([big, title, text]) => (
          <div key={title}><strong>{big}</strong><b>{title}</b><p>{text}</p></div>
        ))}
      </section>
      <section className="cl-steps">
        <h2>How to get started</h2>
        <ol>{steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}</ol>
      </section>
    </div>
  );
}
