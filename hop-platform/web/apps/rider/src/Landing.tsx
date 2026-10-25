import { useState } from "react";
import PageLoader from "@hop/shared/PageLoader";
import Icon from "@hop/shared/Icons";
import PhoneLogin from "@hop/shared/PhoneLogin";
import VehicleArt from "@hop/shared/VehicleArt";

const rides = [
  { id: "bike", name: "Bike", note: "Beat the traffic", from: 25 },
  { id: "auto", name: "Auto", note: "Everyday city hops", from: 40 },
  { id: "mini", name: "Mini cab", note: "Compact AC", from: 60 },
  { id: "sedan", name: "Sedan", note: "Comfort for 4", from: 80 },
  { id: "suv", name: "SUV", note: "Room for 6", from: 120 },
];

const perks: [string, string, string][] = [
  ["tag", "Upfront fares", "See the route and price before you book. No surprises at the end."],
  ["shield", "Verified drivers", "Checked drivers and vehicles, a pickup PIN and one-tap SOS."],
  ["wallet", "Pay your way", "Cash, UPI, wallet or card, straight to your driver."],
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
          <span className="chip">0% commission · fair for drivers and riders</span>
          <h1>
            Go anywhere.
            <br />
            <em>Keep every rupee fair.</em>
          </h1>
          <p className="intro-copy">
            Bikes, autos and cabs with upfront fares and verified drivers. Rent by the hour,
            travel outstation or negotiate your fare.
          </p>
          <ul className="lp-trust">
            <li><Icon name="shield" size={18} /> Verified drivers</li>
            <li><Icon name="tag" size={18} /> Upfront fares</li>
            <li><Icon name="wallet" size={18} /> Cash, UPI or card</li>
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
          <p className="lp-fine">Drivers and riders use the same sign in.</p>
        </div>
      </section>

      <section className="lp-section">
        <h2>Every ride, one app</h2>
        <div className="lp-rides">
          {rides.map((r) => (
            <div className="lp-ride" key={r.id}>
              <VehicleArt category={r.id} width={96} />
              <b>{r.name}</b>
              <small>{r.note}</small>
              <span>from ₹{r.from}</span>
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
