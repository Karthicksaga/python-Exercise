import { test, expect, type Page } from "@playwright/test";
const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
const details = {
  id: "ui-user",
  name: "Responsive Test Rider With A Long Name",
  email: "ui@example.invalid",
  phone: "9092112969",
  phone_verified: true,
  phone_login: true,
  has_photo: false,
  photo_approved: false,
  created_at: "2026-01-01T00:00:00Z",
  gender: "",
  birth_date: null,
  avatar_color: "indigo",
  default_payment: "cash",
  default_vehicle: "",
  company_name: "",
  business_gstin: "",
  cost_centre: "",
  work_email: "",
  deletion_requested_at: null,
};
const stats = {
  rides_taken: 0,
  rides_cancelled: 0,
  spent_paise: 0,
  meters: 0,
  rating_avg: null,
  rating_count: 0,
  wallet_paise: 0,
  reward_points: 0,
  drives_completed: 0,
  saved_places: 0,
};
async function fixture(page: Page, captain: boolean) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const bodies: Record<string, unknown> = {
      "/api/config": {
        areas: [
          {
            id: "chennai",
            name: "Chennai",
            min_lat: 12.8,
            max_lat: 13.2,
            min_lng: 80,
            max_lng: 80.4,
          },
        ],
        vehicles: [],
        development: true,
        phone_login: true,
      },
      "/api/me": {
        user: {
          id: "ui-user",
          name: details.name,
          email: details.email,
          role: "rider",
        },
        csrf: "ui-test",
      },
      "/api/state": {
        rides: [],
        driver: captain
          ? [
              {
                user_id: "ui-user",
                area_id: "chennai",
                status: "approved",
                online: false,
                vehicle_category: "auto",
                vehicle_number: "TN22EB2250",
                pickup_radius_meters: 3000,
                minimum_fare_paise: 0,
                upi_id: "",
                review_note: "",
                location_at: "",
                license_expires: "2028-01-01",
                insurance_expires: "2028-01-01",
              },
            ]
          : [],
        offers: [],
        incidents: [],
        saved_locations: [],
      },
      "/api/profile": { details: [details], stats: [stats], contacts: [] },
      "/api/drivers/insights": {
        totals: [],
        days: [],
        areas: [],
        methods: [],
        types: [],
        peak_hours: [],
        trips: [],
      },
      "/api/nearby": { nearby: [], drivers: [] },
      "/api/wallet": {
        balance_paise: 0,
        entries: [],
        gateway: false,
        dev_topup: true,
      },
      "/api/promos": { promos: [] },
      "/api/notifications/new": {
        notifications: [],
        now: "2026-10-26T00:00:00Z",
      },
      "/api/companion": {
        preferences: { language: "en", notifications_enabled: true },
        notifications: [],
        referral: [],
        rewards: [],
        family: [],
        favorite_drivers: [],
        scheduled_rides: [],
        lost_items: [],
      },
      "/api/drivers/earnings": {
        summary: { today_fare_paise: 0, today_completed_trips: 0 },
        rides: [],
      },
      "/api/drivers/wallet": {
        balance_paise: 0,
        upi_id: "",
        min_payout_paise: 10000,
        ledger: [],
        payouts: [],
        daily: [],
        safety: {
          score: 100,
          label: "Good",
          cancellations: 0,
          incidents: 0,
          rating_avg: 0,
          ratings: 0,
          completed_trips: 0,
        },
      },
    };
    if (!(path in bodies))
      return route.fulfill({
        status: 404,
        json: { error: `Unmocked endpoint: ${path}` },
      });
    return route.fulfill({ json: bodies[path] });
  });
}
const vehicle = {
  area_id: "chennai",
  category: "auto",
  name: "Auto-rickshaw",
  base_paise: 3000,
  per_km_paise: 1500,
  minimum_paise: 3000,
  pricing_version: 1,
  stop_fee_paise: 500,
  hourly_paise: null,
  outstation_per_km_paise: null,
};
async function bookingFixture(page: Page) {
  await page.context().grantPermissions(["geolocation"]);
  await page.context().setGeolocation({ latitude: 13.02, longitude: 80.18 });
  await fixture(page, false);
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        areas: [
          {
            id: "chennai",
            name: "Chennai",
            min_lat: 12.8,
            max_lat: 13.2,
            min_lng: 80,
            max_lng: 80.4,
          },
        ],
        vehicles: [vehicle, { ...vehicle, category: "mini", name: "Mini cab" }],
        phone_login: true,
      },
    }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({
      json: {
        rides: [],
        driver: [],
        offers: [],
        incidents: [],
        saved_locations: [
          {
            id: "office",
            label: "Office",
            place_label: "Office entrance",
            kind: "work",
            lat: 13.04,
            lng: 80.2,
          },
        ],
      },
    }),
  );
  await page.route("**/api/reverse**", (r) =>
    r.fulfill({ json: { lat: 13.02, lng: 80.18, label: "Home entrance" } }),
  );
  await page.route("**/api/estimates", (r) =>
    r.fulfill({
      json: {
        meters: 2000,
        seconds: 600,
        route: [],
        options: [
          { category: "auto", fare_paise: 6000 },
          { category: "mini", fare_paise: 8000 },
        ],
      },
    }),
  );
  await page.route("**/api/quotes", async (r) =>
    r.fulfill({
      json: {
        id: "fresh-quote",
        meters: 2000,
        seconds: 600,
        fare_paise: 6000,
        vehicle_category: "auto",
        vehicle_name: "Auto-rickshaw",
        route: [],
        expires_at: await page.evaluate(() =>
          new Date(Date.now() + 60000).toISOString(),
        ),
        fare_breakdown: {
          base_paise: 3000,
          distance_paise: 3000,
          platform_fee_paise: 0,
          total_paise: 6000,
        },
      },
    }),
  );
}
async function choose(page: Page) {
  await page.goto("http://127.0.0.1:5173");
  await page
    .getByRole("button", { name: "Office", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Choose a ride", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose your ride", exact: true }),
  ).toBeFocused();
}
for (const width of [320, 1440])
  test(`restore and safe retry ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await bookingFixture(page);
    await page.route('**/api/profile',r=>r.fulfill({json:{details:[{avatar_color:'indigo',gender:'',default_payment:'cash',default_vehicle:'mini'}]}}));
    let nearbyCalls = 0;
    await page.route("**/api/nearby?**", (r) => {
      nearbyCalls++;
      return r.fulfill(
        nearbyCalls === 1
          ? { status: 503, json: { error: "unavailable" } }
          : { json: { nearby: [], drivers: [] } },
      );
    });
    await choose(page);
    await expect(
      page
        .getByText("Driver availability unavailable.", { exact: false })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry availability", exact: true })
      .click();
    await expect(
      page.getByText("No drivers nearby right now.", { exact: false }),
    ).toBeVisible();
    const auto = page.getByRole("radio", { name: /Auto-rickshaw/ });
    await auto.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /Mini cab/ })).toBeFocused();
    await expect(page.getByRole("radio", { name: /Mini cab/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("Home");
    await expect(auto).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page
      .getByLabel("Pickup instructions (optional)", { exact: false })
      .fill("Meet by the blue gate");
    await expect(page.locator(".quote")).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Your trip has been restored.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Pickup instructions (optional)", { exact: false }),
    ).toHaveValue("Meet by the blue gate");
    await expect(
      page.getByRole("region", { name: "Trip summary" }),
    ).toContainText("Office entrance");
    let count = 0;
    const payloads: unknown[] = [];
    await page.route("**/api/rides", (r) => {
      payloads.push(r.request().postDataJSON());
      count++;
      return count === 1
        ? r.abort("failed")
        : r.fulfill({ json: { id: "one-ride" } });
    });
    const request = page.getByRole("button", {
      name: "Request Auto-rickshaw",
      exact: true,
    });
    await expect(request).toBeEnabled();
    await request.dblclick();
    await expect(
      page.getByRole("heading", { name: "Confirm your booking outcome" }),
    ).toBeVisible();
    expect(payloads).toHaveLength(1);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Retry same booking request" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Retry same booking request" })
      .click();
    await expect.poll(() => payloads.length).toBe(2);
    expect(payloads[1]).toEqual(payloads[0]);
    expect((payloads[0] as any).pickup_instructions).toBe(
      "Meet by the blue gate",
    );
    await expect(
      page.getByRole("button", { name: "Choose a ride", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        sessionStorage.getItem("hop.rider.booking.v1.ui-user.pending"),
      ),
    ).toBeNull();
  });

test("reject expired or malformed drafts and isolate another account", async ({
  page,
}) => {
  await bookingFixture(page);
  await page.addInitScript(() => {
    sessionStorage.setItem(
      "hop.rider.booking.v1.another-user",
      JSON.stringify({ pickup: { label: "Private other account address" } }),
    );
    sessionStorage.setItem(
      "hop.rider.booking.v1.ui-user",
      JSON.stringify({
        savedAt: 0,
        area: "chennai",
        pickup: { lat: 999, lng: 80, label: "Invalid restored address" },
      }),
    );
  });
  await page.goto("http://127.0.0.1:5173");
  await expect(
    page.getByRole("heading", { name: "Where are you heading?" }),
  ).toBeVisible();
  await expect(
    page.getByText("Your trip has been restored.", { exact: false }),
  ).toHaveCount(0);
  await expect(page.getByText("Private other account address")).toHaveCount(0);
});

test("autocomplete keyboard navigation and offline booking guard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await bookingFixture(page);
  await page.route("**/api/places?**", (r) =>
    r.fulfill({
      json: [
        { lat: 13.04, lng: 80.2, label: "Central Station main entrance" },
        { lat: 13.05, lng: 80.21, label: "Central Station west entrance" },
      ],
    }),
  );
  await page.goto("http://127.0.0.1:5173");
  const destination = page.getByRole("combobox", {
    name: "Destination",
    exact: true,
  });
  await destination.fill("Central Station");
  await expect(
    page.getByRole("listbox", { name: "Destination suggestions" }),
  ).toBeVisible();
  await destination.press("ArrowDown");
  await destination.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText(
    "west entrance",
  );
  await destination.press("Enter");
  await expect(destination).toHaveValue("Central Station west entrance");
  await page
    .getByRole("button", { name: "Choose a ride", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const request = page.getByRole("button", {
    name: "Request Auto-rickshaw",
    exact: true,
  });
  await expect(request).toBeEnabled();
  await page.context().setOffline(true);
  await expect(
    page.getByText("You are offline. Your trip stays in this tab.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(request).toBeDisabled();
  await page.context().setOffline(false);
  await expect(request).toBeEnabled();
});

test("booking works when session storage is unavailable", async ({ page }) => {
  await bookingFixture(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === sessionStorage)
        throw new DOMException("Storage blocked", "SecurityError");
      original.call(this, key, value);
    };
  });
  await choose(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Request Auto-rickshaw", exact: true }),
  ).toBeEnabled();
});

test('booking timeout keeps the original request for recovery', async ({page}) => {
 await bookingFixture(page);
 await choose(page);
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 const request=page.getByRole('button',{name:'Request Auto-rickshaw',exact:true});
 await expect(request).toBeEnabled();
 await page.clock.install();
 let sent=false;
 await page.route('**/api/rides',()=>{sent=true;});
 await request.click();
 await expect.poll(()=>sent).toBe(true);
 await page.clock.fastForward(21000);
 await expect(page.getByRole('heading',{name:'Confirm your booking outcome'})).toBeVisible();
 expect(await page.evaluate(()=>!!sessionStorage.getItem('hop.rider.booking.v1.ui-user.pending'))).toBe(true);
});
