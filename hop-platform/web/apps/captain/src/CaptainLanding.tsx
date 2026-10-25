import { useState } from "react";
import PageLoader from "@hop/shared/PageLoader";
import PhoneLogin from "@hop/shared/PhoneLogin";
import VehicleArt from "@hop/shared/VehicleArt";

const vehicles: [string, string][] = [["bike", "Bike"], ["auto", "Auto"], ["mini", "Mini cab"], ["sedan", "Sedan"], ["suv", "SUV"]];
const perks: [string, string, string][] = [
  ["₹0", "Commission", "Keep 100% of every fare. hop never takes a cut."],
  ["You", "Set the rules", "Choose your pickup radius, minimum fare and the way home."],
  ["Same day", "Direct payment", "Cash or UPI goes straight to you from the rider."],
];
const steps = ["Sign in with your mobile number", "Add your licence, RC and insurance", "Get approved, go online and drive"];

export default function CaptainLanding({ phoneLogin }: { phoneLogin: boolean }) {
  const [going, setGoing] = useState("");
  return (
    <div className="cl">
      <section className="cl-hero">
        <div className="cl-copy">
          <span className="cl-tag">hop Captain</span>
          <h1>Drive.<br /><em>Keep every rupee.</em></h1>
          <p>Zero commission, fair ride matching and tools built for the road: hot-zones, go-home mode and daily goals.</p>
          <div className="cl-fleet">
            {vehicles.map(([id, name]) => (
              <div key={id}><VehicleArt category={id} width={64} /><small>{name}</small></div>
            ))}
          </div>
        </div>
        {going && <PageLoader overlay label={going} />}
        <div className="cl-card">
          <span className="cl-tag dark">Captain sign in</span>
          <h2>Start earning today</h2>
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
        <h2>Get on the road in 3 steps</h2>
        <ol>{steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}</ol>
      </section>
    </div>
  );
}
