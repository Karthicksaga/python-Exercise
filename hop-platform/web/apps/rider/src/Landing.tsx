import { useState } from "react";
import PageLoader from "@hop/shared/PageLoader";
import Icon from "@hop/shared/Icons";
import PhoneLogin from "@hop/shared/PhoneLogin";
import VehicleArt from "@hop/shared/VehicleArt";

const rides = [
  { id: "bike", name: "Bike", note: "Beat the traffic" },
  { id: "auto", name: "Auto", note: "Everyday city hops" },
  { id: "mini", name: "Mini cab", note: "Compact AC" },
  { id: "sedan", name: "Sedan", note: "Comfort for 4" },
  { id: "suv", name: "SUV", note: "Room for 6" },
];

const perks: [string, string, string][] = [
  ["tag", "Clear fare estimates", "Review the route and estimated fare before requesting a ride."],
  ["shield", "Verified drivers", "Checked drivers and vehicles, a pickup PIN and one-tap SOS."],
  ["wallet", "Payment options", "Choose from the payment options available for your trip."],
];

const steps = [
  ["Set your trip", "Pick a pickup and drop, or just say it aloud."],
  ["Choose a ride", "Compare bikes, autos and cabs. Negotiate if you like."],
  ["Ride and track", "Follow your driver live and share your trip."],
];

export default function Landing({ phoneLogin }: { phoneLogin: boolean }) {
  const [going, setGoing] = useState("");
  return (
    <div className="lp">
      <section className="lp-hero">
        <div className="lp-copy">
          <span className="chip">Everyday rides, made simple</span>
          <h1>
            Your next stop.
            <br />
            <em>A simpler ride.</em>
          </h1>
          <p className="intro-copy">
            Choose a bike, auto or cab. Review your fare, confirm your pickup
            and follow your trip in the app.
          </p>
          <ul className="lp-trust">
            <li><Icon name="shield" size={18} /> Verified drivers</li>
            <li><Icon name="tag" size={18} /> Fare estimates</li>
            <li><Icon name="pin" size={18} /> Trip tracking</li>
          </ul>
        </div>
        {going && <PageLoader overlay label={going} />}
        <div className="lp-card">
          <div className="lp-card-head">
            <span className="lp-eyebrow">Welcome to hop</span>
            <h2>Sign in to ride</h2>
          </div>
          <a className="button full" href="/auth/login" onClick={() => setGoing("Taking you to sign in…")}>Continue with your account</a>
          {phoneLogin && (
            <>
              <div className="lp-or"><span>or</span></div>
              <PhoneLogin onSignedIn={() => { setGoing("Signing you in…"); window.location.reload(); }} />
            </>
          )}
          <p className="lp-fine">Sign in to book and manage your rides.</p>
        </div>
      </section>

      <section className="lp-section">
        <h2>Find a ride for your day</h2>
        <div className="lp-rides">
          {rides.map((r) => (
            <div className="lp-ride" key={r.id}>
              <VehicleArt category={r.id} width={96} />
              <b>{r.name}</b>
              <small>{r.note}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-perks">
          {perks.map(([icon, title, text]) => (
            <div className="lp-perk" key={title}>
              <span className="lp-ico"><Icon name={icon} size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-how">
        <h2>How it works</h2>
        <ol>
          {steps.map(([title, text], i) => (
            <li key={title}>
              <span className="lp-num">{i + 1}</span>
              <div><b>{title}</b><p>{text}</p></div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
