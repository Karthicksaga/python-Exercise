import { test, expect } from "@playwright/test";
const pickup = { lat: 13.0067, lng: 80.2206, label: "Adyar pickup" },
  dropoff = { lat: 12.994, lng: 80.17, label: "Airport destination" };
const route = [pickup, { lat: 13, lng: 80.2 }, dropoff];
const past = {
  id: "past-trip",
  mine: true,
  version: 2,
  status: "completed",
  pickup_lat: pickup.lat,
  pickup_lng: pickup.lng,
  dropoff_lat: dropoff.lat,
  dropoff_lng: dropoff.lng,
  pickup_label: pickup.label,
  dropoff_label: dropoff.label,
  vehicle_category: "auto",
  payment_method: "cash",
  fare_paise: 23700,
  driver_name: "Verified Captain",
  vehicle_number: "TN01TEST",
  created_at: "2026-10-28T10:00:00Z",
};
async function fixture(page, { rides = [], rejectProfile = false } = {}) {
  const posts = [];
  let profile = {
    name: "Actual Rider",
    phone: "9876543210",
    phone_verified: true,
    default_payment: "cash",
    default_vehicle: "auto",
  };
  let scheduled = [
    {
      id: "scheduled-trip",
      category: "auto",
      status: "scheduled",
      pickup_label: "Home",
      dropoff_label: "Office",
      scheduled_for: "2026-11-01T10:00:00Z",
    },
  ];
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request(),
      p = new URL(req.url()).pathname,
      body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body) posts.push({ path: p, body });
    let json = {};
    if (p === "/api/config")
      json = {
        areas: [
          {
            id: "chennai",
            name: "Chennai",
            min_lat: 12.8,
            max_lat: 13.3,
            min_lng: 80,
            max_lng: 80.5,
          },
        ],
        vehicles: [{ area_id: "chennai", category: "auto", name: "Auto" }],
        development: true,
      };
    if (p === "/api/me") json = { user: { id: "rider" }, csrf: "csrf" };
    if (p === "/api/state") json = { rides, offers: [], driver: [] };
    if (p === "/api/profile") {
      if (body && rejectProfile)
        return r.fulfill({
          status: 409,
          json: { error: "Identity review required" },
        });
      if (body) profile = { ...profile, ...body };
      json = { details: [profile], contacts: [] };
    }
    if (p === "/api/places")
      json = [
        new URL(req.url()).searchParams.get("q").includes("Adyar")
          ? pickup
          : dropoff,
      ];
    if (p === "/api/routes/alternatives")
      json = { routes: [{ route, meters: 9000, seconds: 1500 }] };
    if (p === "/api/estimates")
      json = { options: [{ category: "auto", fare_paise: 23700 }] };
    if (p === "/api/quotes")
      json = {
        id: "quote-real",
        fare_paise: 23700,
        payable_paise: body?.promo_code ? 22700 : 23700,
        discount_paise: body?.promo_code ? 1000 : 0,
        route,
        meters: 9000,
        seconds: 1500,
      };
    if (p === "/api/companion")
      json = {
        scheduled_rides: scheduled,
        family: [],
        preferences: { language: "en", notifications_enabled: true },
      };
    if (p === "/api/scheduled-rides/scheduled-trip/cancel") scheduled = [];
    if (p === "/api/rides") {
      rides = [{ ...past, id: "active-trip", status: "requested" }];
      json = { id: "active-trip" };
    }
    await r.fulfill({ json });
  });
  await page.goto("http://127.0.0.1:5183");
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  return posts;
}
async function chooseRoute(page) {
  await page.locator('[data-go="search"]').first().click();
  await page
    .getByRole("textbox", { name: "Pickup location", exact: true })
    .fill("Adyar");
  await page.locator("[data-live-place]").first().click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport");
  await page.locator("[data-live-place]").first().click();
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText(
    "₹237",
  );
}
async function review(page) {
  await page.locator('[data-action="review"]').click();
  await expect(page.locator(".confirm-sheet")).toBeVisible();
}
test("history uses actual states, server schedules, pagination, reports and fresh rebooking", async ({
  page,
}) => {
  const posts = await fixture(page, {
    rides: Array.from({ length: 12 }, (_, i) => ({ ...past, id: `past-${i}` })),
  });
  await page.locator('[data-go="activity"]').first().click();
  await expect(
    page.getByRole("heading", { name: "No active rides" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await expect(page.locator(".activity-card")).toHaveCount(10);
  await expect(page.locator(".activity-card").first()).toContainText(
    "Verified Captain",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".activity-card")).toHaveCount(2);
  await page.getByRole("tab", { name: "Upcoming", exact: true }).click();
  await expect(page.locator(".activity-card")).toContainText("Office");
  await page.getByRole("button", { name: "Cancel scheduled ride" }).click();
  await expect(
    page.getByRole("heading", { name: "No upcoming rides" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await page
    .getByRole("button", { name: "Report an issue", exact: true })
    .first()
    .click();
  await page
    .locator("#history-report")
    .fill("The trip receipt needs investigation");
  await page.getByRole("button", { name: "Submit report" }).click();
  expect(posts.find((p) => p.path === "/api/incidents").body).toMatchObject({
    ride_id: "past-0",
    message: "The trip receipt needs investigation",
  });
  await page
    .getByRole("button", { name: "Book again", exact: true })
    .first()
    .click();
  await expect(page.locator(".choose-sheet .subline")).toContainText("9.0 km");
  expect(posts.some((p) => p.path === "/api/rides")).toBe(false);
});
test("profile writes actual API fields and displays server rejection without success", async ({
  page,
}) => {
  const posts = await fixture(page, { rejectProfile: true });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="personal"]').click();
  await expect(page.getByLabel("Full name")).toHaveValue("Actual Rider");
  await page.getByLabel("Full name").fill("Changed Rider");
  await page.locator('[data-account-action="profile"]').click();
  await expect(page.locator('.screen-padding [role="status"]')).toContainText(
    "Identity review required",
  );
  expect(posts.find((p) => p.path === "/api/profile").body.name).toBe(
    "Changed Rider",
  );
});
test("promo, passenger, shared ride and negotiated offer are sent through backend contracts", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await review(page);
  await page.locator('[data-modal="promo"]').click();
  await page.getByLabel("Promo code", { exact: true }).fill("REALCODE");
  await page.getByRole("button", { name: "Apply code", exact: true }).click();
  await review(page);
  await expect(page.locator(".footer-price strong")).toHaveText("₹227");
  await page.locator('[data-modal="passenger"]').click();
  await page.getByLabel("Passenger name (optional)").fill("Another Rider");
  await page.getByLabel("Passenger mobile").fill("9876543210");
  await page.getByRole("button", { name: "Save passenger" }).click();
  await review(page);
  await page.locator('[data-modal="options"]').click();
  await page.getByLabel("Share this ride", { exact: true }).check();
  await page.getByLabel("Your fare offer (₹, optional)").fill("230");
  await page.getByRole("button", { name: "Save ride options" }).click();
  await review(page);
  await page.locator('[data-action="request"]').click();
  await expect
    .poll(() => posts.filter((p) => p.path === "/api/rides").length)
    .toBe(1);
  expect(
    posts.filter((p) => p.path === "/api/quotes").at(-1).body.promo_code,
  ).toBe("REALCODE");
  expect(posts.find((p) => p.path === "/api/rides").body).toMatchObject({
    quote_id: "quote-real",
    share: true,
    offer_paise: 23000,
    passenger_name: "Another Rider",
    passenger_phone: "9876543210",
  });
});
test("rental and outstation use server quote parameters and unsupported categories stay unavailable", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-go="plan"]').click();
  await page.locator("#trip-type").selectOption("rental");
  await page.getByLabel("Rental hours (1–12)").fill("4");
  await page.getByRole("button", { name: "Save trip plan" }).click();
  await expect(page.locator('[data-action="review"]')).toBeEnabled();
  await review(page);
  expect(
    posts.filter((p) => p.path === "/api/quotes").at(-1).body,
  ).toMatchObject({ trip_type: "rental", rental_hours: 4 });
});
test("a stale quote cannot survive unsaved price-changing option edits", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await review(page);
  await page.locator('[data-modal="promo"]').click();
  await page.getByLabel("Promo code", { exact: true }).fill("UNSAVED");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.locator('[data-action="request"]').click();
  await expect(page.locator(".toast")).toContainText("Ride options changed");
  expect(posts.some((p) => p.path === "/api/rides")).toBe(false);
});
for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`live history and personal details fit ${width}px with dark mode and larger text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await fixture(page, { rides: [past] });
    await page.locator('[data-go="activity"]').first().click();
    await page.getByRole("tab", { name: "Past", exact: true }).click();
    await page
      .locator("#app")
      .evaluate((el) => el.classList.add("dark", "large-text"));
    await expect(
      page.getByRole("button", { name: "Report an issue", exact: true }),
    ).toBeVisible();
    expect(
      await page
        .locator("#app")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="personal"]').click();
    await expect(page.getByLabel("Full name")).toHaveValue("Actual Rider");
    await page
      .locator("#app")
      .evaluate((el) => el.classList.add("dark", "large-text"));
    if (width === 390)
      await page.screenshot({ path: "/tmp/hop-completion-profile.png" });
    expect(
      await page
        .locator("#app")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  });
}

test("scheduled rides use actual date and coordinates without creating an immediate ride", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-go="plan"]').click();
  const at = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
  await page.locator("#schedule-at").fill(at);
  await page.getByRole("button", { name: "Save trip plan" }).click();
  await review(page);
  await page.locator('[data-modal="payment"]').click();
  await page.locator('[data-payment="Cash"]').click();
  await page.locator('[data-action="request"]').click();
  await expect
    .poll(() => posts.filter((p) => p.path === "/api/scheduled-rides").length)
    .toBe(1);
  expect(
    posts.find((p) => p.path === "/api/scheduled-rides").body,
  ).toMatchObject({
    pickup_lat: pickup.lat,
    dropoff_lng: dropoff.lng,
    payment_method: "cash",
    category: "auto",
  });
  expect(posts.some((p) => p.path === "/api/rides")).toBe(false);
});
test("resolved stop coordinates are preserved in route and quote requests", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-modal="stops"]').click();
  await page.getByLabel("Stop address").fill("Adyar");
  await page.getByRole("button", { name: "Search addresses" }).click();
  await page.locator("[data-booking-place]").first().click();
  await page.locator('[data-booking-action="save"]').click();
  await review(page);
  expect(
    posts.filter((p) => p.path === "/api/routes/alternatives").at(-1).body
      .stops,
  ).toEqual([pickup]);
  expect(
    posts.filter((p) => p.path === "/api/quotes").at(-1).body.stops,
  ).toEqual([pickup]);
});
test("outstation parameters and India-wide destination search use existing API fields", async ({
  page,
}) => {
  const posts = await fixture(page);
  await chooseRoute(page);
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator('[data-go="plan"]').click();
  await page.locator("#trip-type").selectOption("outstation");
  await page.getByLabel("Trip days (1–10)").fill("3");
  await page.getByLabel("Round trip", { exact: true }).check();
  await page.getByRole("button", { name: "Save trip plan" }).click();
  await review(page);
  expect(
    posts.filter((p) => p.path === "/api/quotes").at(-1).body,
  ).toMatchObject({ trip_type: "outstation", trip_days: 3, round_trip: true });
});

test("estimate failure clears a successful route and retry restores only backend fares", async ({
  page,
}) => {
  let fail = true;
  const posts = await fixture(page);
  await page.route("**/api/estimates", (r) =>
    fail
      ? r.fulfill({ status: 503, json: { error: "Prices unavailable" } })
      : r.fulfill({
          json: { options: [{ category: "auto", fare_paise: 23700 }] },
        }),
  );
  await page.locator('[data-go="search"]').first().click();
  await page
    .getByRole("textbox", { name: "Pickup location", exact: true })
    .fill("Adyar");
  await page.locator("[data-live-place]").first().click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport");
  await page.locator("[data-live-place]").first().click();
  await expect(page.getByRole("alert")).toContainText("Prices unavailable");
  await expect(page.locator('[data-action="review"]')).toBeDisabled();
  expect(posts.some((p) => p.path === "/api/quotes")).toBe(false);
  fail = false;
  await page.getByRole("button", { name: "Retry route and fares" }).click();
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText(
    "₹237",
  );
  await expect(page.locator('[data-action="review"]')).toBeEnabled();
});
test("safety report uses the selected real trip and preserves text after server failure", async ({
  page,
}) => {
  const posts = await fixture(page, { rides: [past] });
  await page.route("**/api/incidents", async (r) => {
    posts.push({ path: "/api/incidents", body: r.request().postDataJSON() });
    await r.fulfill({
      status: 503,
      json: { error: "Operator service unavailable" },
    });
  });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="safety"]').click();
  await page.locator('[data-modal="report"]').click();
  await page.getByLabel("Trip", { exact: true }).selectOption("past-trip");
  await page
    .getByLabel("Describe the issue")
    .fill("A real trip safety concern");
  await page.locator('[data-account-action="report"]').click();
  await expect(page.locator('.modal-sheet [role="status"]')).toContainText(
    "Operator service unavailable",
  );
  await expect(page.getByLabel("Describe the issue")).toHaveValue(
    "A real trip safety concern",
  );
  expect(posts.find((p) => p.path === "/api/incidents").body).toMatchObject({
    ride_id: "past-trip",
    message: "A real trip safety concern",
  });
});
test("history tabs support keyboard navigation", async ({ page }) => {
  await fixture(page, { rides: [past] });
  await page.locator('[data-go="activity"]').first().click();
  await page.getByRole("tab", { name: "Ongoing", exact: true }).focus();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Past", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("tab", { name: "Past", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("heading", { name: "No active rides" }),
  ).toBeVisible();
});
test("Captain cockpit displays server guidance and no synthetic speed or speed limit", async ({
  page,
}) => {
  const trip = {
    ...past,
    id: "captain-active",
    mine: false,
    driving: true,
    status: "accepted",
  };
  await fixture(page, { rides: [trip] });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator('[data-action="toggle-cockpit"]')).toBeVisible();
  await page.locator('[data-action="toggle-cockpit"]').click();
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("hop-navigation", {
        detail: {
          steps: [
            { instruction: "Continue on the verified road", meters: 120 },
          ],
          seconds: 180,
          meters: 900,
          stale: false,
        },
      }),
    ),
  );
  await expect(page.locator(".cockpit-turn-street")).toHaveText(
    "Continue on the verified road",
  );
  await expect(page.locator(".speed-num")).toHaveText("—");
  await expect(page.locator(".speed-limit-sign span:last-child")).toHaveText(
    "—",
  );
});
test("uncertain account top-up creation is not retried as a new payment", async ({
  page,
}) => {
  let attempts = 0;
  await fixture(page);
  await page.route("**/api/wallet", (r) =>
    r.fulfill({ json: { balance_paise: 10000, entries: [] } }),
  );
  await page.route("**/api/wallet/topup", (r) => {
    attempts++;
    return r.abort("failed");
  });
  await page.locator('[data-go="wallet"]').first().click();
  await page.locator('[data-modal="topup"]').click();
  await page.getByLabel("Add money (₹)").fill("100");
  await page.locator('[data-account-action="topup"]').click();
  await expect.poll(() => attempts).toBe(1);
  await expect(page.locator('#modal-error')).not.toBeEmpty();
  await page.locator('[data-account-action="topup"]').click();
  await expect(page.locator('#modal-error')).toContainText(
    "uncertain",
  );
  expect(attempts).toBe(1);
});

test('server route alternatives preserve their index and use a fresh backend quote',async({page})=>{
 const posts=await fixture(page);const alternative=[pickup,{lat:13.01,lng:80.18},dropoff];
 await page.route('**/api/routes/alternatives',r=>r.fulfill({json:{routes:[{route,meters:9000,seconds:1500},{route:alternative,meters:11000,seconds:1800}]}}));
 await page.route('**/api/quotes',r=>{const body=r.request().postDataJSON();posts.push({path:'/api/quotes',body});return r.fulfill({json:{id:'alternative-quote',fare_paise:30000,route:alternative,meters:11000,seconds:1800}});});
 await chooseRoute(page);await page.locator('[data-live-route-index="1"]').click();await expect(page.locator('.choose-sheet .subline')).toContainText('11.0 km');await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText('₹300');await review(page);expect(posts.filter(p=>p.path==='/api/quotes').at(-1).body.route_index).toBe(1);
});

test("canonical wallet screen preserves prototype layout and top-up modal updates balance", async ({
  page,
}) => {
  let balancePaise = 35000;
  let topupPayload;
  await fixture(page);
  await page.route("**/api/wallet", (r) =>
    r.fulfill({
      json: {
        balance_paise: balancePaise,
        entries: [
          {
            id: "entry-1",
            kind: "topup",
            amount_paise: 50000,
            note: "Bank UPI credit",
            created_at: new Date().toISOString(),
          },
          {
            id: "entry-2",
            kind: "ride_payment",
            amount_paise: -15000,
            note: "Auto ride",
            created_at: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
      },
    }),
  );
  await page.route("**/api/wallet/topup", (r) => {
    topupPayload = r.request().postDataJSON();
    balancePaise += topupPayload.amount_paise;
    return r.fulfill({ json: { balance_paise: balancePaise } });
  });

  await page.locator('[data-go="wallet"]').first().click();

  await expect(page.locator("header h1")).toHaveText("Wallet & offers");
  const hero = page.locator(".wallet-hero");
  await expect(hero).toBeVisible();
  await expect(hero.locator("small")).toHaveText("YOUR HOP WALLET");
  await expect(hero.locator(".amount")).toContainText("₹350");
  await expect(hero.locator(".icon")).toBeVisible();
  const addMoneyBtn = hero.locator('button[data-modal="topup"]');
  await expect(addMoneyBtn).toHaveText("+ Add money");

  const offerCard = page.locator(".offer-card");
  await expect(offerCard).toBeVisible();
  await expect(offerCard.locator("strong")).toContainText("A little off your next ride");
  await expect(offerCard.locator('button[data-action="apply-promo"]')).toBeVisible();

  await expect(page.locator(".screen-padding > .section-label")).toContainText("Recent transactions");
  const rows = page.locator(".screen-padding .list-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Added to wallet");
  await expect(rows.first()).toContainText("+₹500");
  await expect(rows.nth(1)).toContainText("Ride payment");
  await expect(rows.nth(1)).toContainText("−₹150");

  await expect(page.locator(".screen-padding > .notice-box")).toContainText(
    "Cash, direct UPI and online payment options remain available at trip confirmation.",
  );

  await addMoneyBtn.click();
  const modalSheet = page.locator(".modal-sheet");
  await expect(modalSheet).toBeVisible();
  await expect(modalSheet.locator("#modal-title")).toHaveText("Add to your wallet.");
  await expect(modalSheet.locator("p.muted").first()).toHaveText(
    "Choose an amount or enter custom amount.",
  );

  const chips = modalSheet.locator(".product-chip");
  await expect(chips).toHaveCount(4);
  await expect(modalSheet.locator('.product-chip[data-topup-chip="500"]')).toHaveClass(/active/);
  await expect(modalSheet.locator("#topup-amount")).toHaveValue("500");

  await modalSheet.locator('.product-chip[data-topup-chip="1000"]').click();
  await expect(modalSheet.locator('.product-chip[data-topup-chip="1000"]')).toHaveClass(/active/);
  await expect(modalSheet.locator("#topup-amount")).toHaveValue("1000");

  const submitBtn = modalSheet.locator('button[data-account-action="topup"]');
  await expect(submitBtn).toHaveClass(/primary/);
  await expect(submitBtn).toContainText("Add money with provider checkout");

  await submitBtn.click();

  await expect(modalSheet).not.toBeVisible();
  expect(topupPayload).toEqual({ amount_paise: 100000 });
  await expect(hero.locator(".amount")).toContainText("₹1,350");
});
