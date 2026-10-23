import { useCallback, useEffect, useRef, useState } from "react";
import { api, APIError, setCSRF } from "./api";
import {
  active,
  money,
  type Area,
  type Point,
  type Quote,
  type State,
  type User,
} from "./types";
import PlaceInput from "./PlaceInput";
import RideCard from "./RideCard";
import DriverPanel from "./DriverPanel";
import OperatorPanel from "./OperatorPanel";

const empty: State = { rides: [], driver: [], offers: [], incidents: [] };
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [areas, setAreas] = useState<Area[]>([]),
    [data, setData] = useState<State>(empty),
    [tab, setTab] = useState("ride"),
    [notice, setNotice] = useState(""),
    [connection, setConnection] = useState(""),
    [busy, setBusy] = useState(false),
    [development, setDevelopment] = useState(false);
  const [area, setArea] = useState(""),
    [pickup, setPickup] = useState<Point | null>(null),
    [dropoff, setDropoff] = useState<Point | null>(null),
    [quote, setQuote] = useState<Quote | null>(null),
    [payment, setPayment] = useState<"cash" | "upi">("cash"),
    [now, setNow] = useState(Date.now());
  const bookingKey = useRef(""),
    bookingAttempt = useRef<{
      quote_id: string;
      request_key: string;
      payment_method: "cash" | "upi";
    } | null>(null);
  const notify = useCallback((s: string) => setNotice(s), []);
  const refresh = useCallback(async () => {
    try {
      const next = await api<State>("/api/state");
      setData(next);
      setConnection("");
    } catch (e) {
      if (e instanceof APIError && e.status === 401) {
        setUser(null);
        setData(empty);
      }
      setConnection((e as Error).message);
    }
  }, []);
  useEffect(() => {
    let live = true;
    async function init() {
      try {
        const config = await api<{ areas: Area[]; development: boolean }>(
          "/api/config",
        );
        if (!live) return;
        setAreas(config.areas);
        setDevelopment(config.development);
        if (config.areas.length) setArea(config.areas[0].id);
        try {
          const me = await api<{ user: User; csrf: string }>("/api/me");
          if (live) {
            setCSRF(me.csrf);
            setUser(me.user);
          }
        } catch (e) {
          if (!(e instanceof APIError && e.status === 401)) throw e;
        }
      } catch (e) {
        if (live) setConnection((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }
    void init();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user, refresh]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(null);
    bookingKey.current = "";
    bookingAttempt.current = null;
  }, [area, pickup, dropoff, payment]);
  const current = data.rides.find((r) => r.mine && active(r));
  async function estimate() {
    setBusy(true);
    setNotice("");
    try {
      const q = await api<Quote>("/api/quotes", {
        area_id: area,
        pickup,
        dropoff,
      });
      setQuote(q);
      bookingKey.current = crypto.randomUUID();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function book() {
    if (!quote) return;
    setBusy(true);
    const body = bookingAttempt.current ?? {
      quote_id: quote.id,
      request_key: bookingKey.current,
      payment_method: payment,
    };
    bookingAttempt.current = body;
    try {
      await api("/api/rides", body);
      setQuote(null);
      bookingAttempt.current = null;
      await refresh();
      notify("Ride requested. Waiting for a nearby approved driver.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/auth/logout", {});
      setCSRF("");
      setUser(null);
      setData(empty);
      setTab("ride");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <>
      <header>
        <a href="/" className="logo">
          hop
          <span className="arrow" aria-hidden="true" />
        </a>
        <div className="header-tag">YOUR EVERYDAY RIDE</div>
        <div className="header-right">
          <span className="commission">0% platform commission</span>
          {user && (
            <button className="text-button" onClick={logout}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <main>
        {development && (
          <div className="dev-banner">
            Development environment — no real rides or payments.
          </div>
        )}
        {connection && (
          <div className="alert" role="alert">
            {connection}{" "}
            <button className="text-button" onClick={() => location.reload()}>
              Reconnect
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button
              className="text-button"
              aria-label="Dismiss message"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {loading ? (
          <div className="empty">Connecting to Hop…</div>
        ) : !user ? (
          <section className="landing">
            <div>
              <p className="eyebrow">A FAIRER WAY TO GET THERE</p>
              <h1>
                Your city.
                <br />
                Your ride.
                <br />
                <em>Zero commission.</em>
              </h1>
              <p className="intro-copy">
                Book a bike ride and pay your driver directly. Clear fares,
                approved drivers, and more of every fare going where it belongs.
              </p>
              <a className="button" href="/auth/login">
                Sign in to get going{" "}
                <span className="arrow" aria-hidden="true" />
              </a>
              <p className="muted">
                Secure sign-in · Cash or direct UPI · Web and mobile browsers
              </p>
            </div>
            <div className="landing-card">
              <div className="city-art" aria-hidden="true">
                <div className="art-path" />
                <i className="art-pin first" />
                <i className="art-pin second" />
                <span>ONE CITY AT A TIME</span>
              </div>
              <h2>A little closer to wherever’s next.</h2>
              <p>
                Availability depends on your service area. You’ll see an upfront
                road-distance quote before requesting a ride.
              </p>
              <div className="mini-stats">
                <div>
                  <strong>₹0</strong>
                  <small>Platform commission</small>
                </div>
                <div>
                  <strong>Direct</strong>
                  <small>Payment to your driver</small>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="welcome">
              <div>
                <p className="eyebrow">
                  GOOD TO SEE YOU,{" "}
                  {user.name.split(" ")[0].toUpperCase() || "THERE"}
                </p>
                <h1>Let’s get you moving.</h1>
              </div>
              <span className="verified">● Verified account</span>
            </div>
            <nav className="tabs" aria-label="Main navigation">
              {[
                ["ride", "Book a ride"],
                ["driver", "Drive with Hop"],
                ["history", "Your rides"],
                ["support", "Support"],
                ...(user.role === "operator"
                  ? [["operator", "Operations"]]
                  : []),
              ].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  aria-current={tab === id ? "page" : undefined}
                  className={tab === id ? "selected" : ""}
                >
                  {label}
                </button>
              ))}
            </nav>
            {tab === "ride" && (
              <div className="booking-grid">
                <section className="panel">
                  <p className="eyebrow">YOUR NEXT JOURNEY</p>
                  <h2>Where are we going?</h2>
                  {current ? (
                    <RideCard
                      ride={current}
                      refresh={refresh}
                      notify={notify}
                    />
                  ) : areas.length === 0 ? (
                    <div className="empty">
                      <strong>We’re preparing your service areas.</strong>
                      <p>
                        Bookings will open after local operations and driver
                        availability are confirmed.
                      </p>
                    </div>
                  ) : (
                    <>
                      <label>
                        Service area
                        <select
                          value={area}
                          onChange={(e) => {
                            setArea(e.target.value);
                            setPickup(null);
                            setDropoff(null);
                          }}
                          disabled={busy}
                        >
                          {areas.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}, {a.state}
                            </option>
                          ))}
                        </select>
                      </label>
                      <fieldset disabled={busy}>
                        <PlaceInput
                          key={area + "pickup"}
                          label="Pickup"
                          area={area}
                          value={pickup}
                          onChange={setPickup}
                          current
                        />
                        <PlaceInput
                          key={area + "dropoff"}
                          label="Destination"
                          area={area}
                          value={dropoff}
                          onChange={setDropoff}
                        />
                        <label>
                          Pay your driver
                          <select
                            value={payment}
                            onChange={(e) =>
                              setPayment(e.target.value as "cash" | "upi")
                            }
                          >
                            <option value="cash">Cash</option>
                            <option value="upi">Direct UPI</option>
                          </select>
                        </label>
                      </fieldset>
                      {quote ? (
                        <div className="quote">
                          <div className="quote-top">
                            <div>
                              <strong>Bike ride</strong>
                              <small>
                                {(quote.meters / 1000).toFixed(1)} km · about{" "}
                                {Math.ceil(quote.seconds / 60)} min
                              </small>
                            </div>
                            <strong className="fare">
                              {money(quote.fare_paise)}
                            </strong>
                          </div>
                          <p className="muted">
                            ₹0 platform fee · Quote valid for{" "}
                            {Math.max(
                              0,
                              Math.ceil(
                                (Date.parse(quote.expires_at) - now) / 1000,
                              ),
                            )}
                            s
                          </p>
                          <button
                            className="full"
                            disabled={
                              busy || Date.parse(quote.expires_at) <= now
                            }
                            onClick={book}
                          >
                            {busy ? "Requesting…" : "Request a bike"}{" "}
                            <span className="arrow" aria-hidden="true" />
                          </button>
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={estimate}
                          >
                            Refresh quote
                          </button>
                        </div>
                      ) : (
                        <button
                          className="full"
                          disabled={busy || !pickup || !dropoff}
                          onClick={estimate}
                        >
                          {busy ? "Finding a road route…" : "See fare"}{" "}
                          <span className="arrow" aria-hidden="true" />
                        </button>
                      )}
                      <p className="muted">
                        Your fare is calculated from road distance. No money is
                        collected by Hop.
                      </p>
                    </>
                  )}
                </section>
                <aside>
                  <div className="promise">
                    <div className="promise-icon">
                      <span className="arrow" aria-hidden="true" />
                    </div>
                    <h2>
                      Good journeys.
                      <br />
                      Fairer fares.
                    </h2>
                    <p>
                      We connect you to approved drivers in your service area.
                      The fare goes directly to your driver.
                    </p>
                    <div className="promise-row">
                      <span>01</span>
                      <div>
                        <strong>Know your fare</strong>
                        <p>Review the route and fare before you book.</p>
                      </div>
                    </div>
                    <div className="promise-row">
                      <span>02</span>
                      <div>
                        <strong>Meet with confidence</strong>
                        <p>
                          Verify the vehicle and share your pickup code in
                          person.
                        </p>
                      </div>
                    </div>
                    <div className="promise-row">
                      <span>03</span>
                      <div>
                        <strong>Pay directly</strong>
                        <p>Cash or UPI. Zero platform commission.</p>
                      </div>
                    </div>
                  </div>
                  <div className="safety-note">
                    <strong>A helmet for every journey.</strong>
                    <p>
                      Wear a properly fastened helmet and check the vehicle
                      details before starting.
                    </p>
                  </div>
                </aside>
              </div>
            )}
            {tab === "driver" && (
              <DriverPanel
                data={data}
                areas={areas}
                refresh={refresh}
                notify={notify}
              />
            )}
            {tab === "history" && (
              <section>
                <div className="section-heading">
                  <h2>Your journeys</h2>
                  <span>Most recent 50 rides</span>
                </div>
                {!data.rides.length ? (
                  <div className="empty">
                    Your booked and driven rides will appear here.
                  </div>
                ) : (
                  <div className="ride-grid">
                    {data.rides.map((r) => (
                      <RideCard
                        key={r.id}
                        ride={r}
                        refresh={refresh}
                        notify={notify}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
            {tab === "support" && (
              <section className="panel">
                <h2>Ride support</h2>
                <p>
                  Use “Report a ride issue” on a trip to send a message to the
                  operator team.
                </p>
                <div className="safety-note">
                  <strong>Immediate danger? Call 112.</strong>
                  <p>
                    Reports in this app are reviewed by operators; they do not
                    dispatch emergency services.
                  </p>
                  <a href="tel:112">Call 112</a>
                </div>
                <h3>Your reports</h3>
                {data.incidents.length ? (
                  data.incidents.map((i) => (
                    <article key={i.id} className="inset">
                      <span className="pill">{i.status}</span>
                      <p>{i.message}</p>
                      {i.resolution && (
                        <p>
                          <strong>Operator response:</strong> {i.resolution}
                        </p>
                      )}
                    </article>
                  ))
                ) : (
                  <p className="muted">No reports yet.</p>
                )}
              </section>
            )}
            {tab === "operator" && user.role === "operator" && (
              <OperatorPanel notify={notify} />
            )}
          </>
        )}
        <footer>
          <strong>hop · A fairer everyday ride</strong>
          <span>India · Cash & direct UPI · Zero platform commission</span>
        </footer>
      </main>
    </>
  );
}
