import { test, expect } from "@playwright/test";
const pickup = { lat: 13.0067, lng: 80.2206, label: "Adyar pickup" },
  dropoff = { lat: 12.994, lng: 80.17, label: "Airport destination" };
const road = [
  pickup,
  { lat: 13.001, lng: 80.205 },
  { lat: 12.998, lng: 80.19 },
  dropoff,
];
const config = {
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
  vehicles: [{ area_id: "chennai", category: "auto", name: "Auto" }],
  development: true,
  routing_configured: true,
  phone_login: true,
};
async function setup(
  page,
  state = () => ({ rides: [], driver: [], offers: [] }),
) {
  await page.route("https://maps.googleapis.com/**", (r) => r.abort());
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) =>
    r.fulfill({ json: {} }),
  );
  await page.route("**/api/config", (r) => r.fulfill({ json: config }));
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "account" }, csrf: "csrf-test" } }),
  );
  await page.route("**/api/state", (r) => r.fulfill({ json: state() }));
  await page.route("**/api/notifications/new", (r) =>
    r.fulfill({ json: { notifications: [] } }),
  );
  await page.route("**/api/places?*", (r) =>
    r.fulfill({
      json: [
        new URL(r.request().url()).searchParams.get("q").includes("Adyar")
          ? pickup
          : dropoff,
      ],
    }),
  );
  await page.route("**/api/routes/alternatives", (r) =>
    r.fulfill({
      json: { routes: [{ route: road, meters: 9000, seconds: 1500 }] },
    }),
  );
  await page.route("**/api/estimates", (r) =>
    r.fulfill({ json: { options: [{ category: "auto", fare_paise: 23700 }] } }),
  );
}
async function selectRoute(page) {
  await page.getByRole("button", { name: "Where are you going?" }).click();
  await page
    .getByRole("textbox", { name: "Pickup location", exact: true })
    .fill("Adyar");
  await page
    .locator("[data-live-place]")
    .filter({ hasText: "Adyar pickup" })
    .click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport");
  await page
    .locator("[data-live-place]")
    .filter({ hasText: "Airport destination" })
    .click();
  await expect(page.locator(".choose-sheet .subline")).toContainText("9.0 km");
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText(
    "₹237",
  );
}
test("rider searches actual places, draws road route, obtains quote and submits backend booking", async ({
  page,
}) => {
  let booked = false,
    payload;
  const ride = {
    id: "new-ride",
    version: 1,
    status: "requested",
    mine: true,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    vehicle_category: "auto",
    payment_method: "wallet",
    fare_paise: 23700,
    route: road,
  };
  await setup(page, () => ({
    rides: booked ? [ride] : [],
    offers: [],
    driver: [],
  }));
  await page.route("**/api/quotes", (r) =>
    r.fulfill({
      json: {
        id: "real-quote",
        fare_paise: 23700,
        meters: 9000,
        seconds: 1500,
        route: road,
      },
    }),
  );
  await page.route("**/api/rides", (r) => {
    payload = r.request().postDataJSON();
    booked = true;
    return r.fulfill({ json: { id: "new-ride" } });
  });
  await page.goto("http://127.0.0.1:5183");
  // Returning from rental planning must not relabel a new city booking.
  await page.getByRole("button", { name: "Plan a ride", exact: true }).click();
  await page.locator("#trip-type").selectOption("rental");
  await expect(page.locator("#rental-hours")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await selectRoute(page);
  await expect(
    page.locator('.leaflet-overlay-pane path[fill="none"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".confirm-sheet .badge")).toHaveText(
    "Backend quote",
  );
  await expect(page.locator(".confirm-route")).toContainText(dropoff.label);
  await expect(page.locator(".confirm-route")).not.toContainText(
    "Hourly rental",
  );
  await expect(
    page.locator('.confirm-sheet [data-modal="fare"] small'),
  ).toHaveText("₹237");
  await page
    .getByRole("button", { name: "Request a ride", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Finding your captain", exact: true }),
  ).toBeVisible();
  expect(payload).toMatchObject({
    quote_id: "real-quote",
    payment_method: "wallet",
  });
  expect(payload.request_key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page.locator(".handoff-box")).toHaveCount(0);
});
test("follow me pins current GPS without changing selected route endpoints", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 13.004,
    longitude: 80.21,
    accuracy: 10,
  });
  await setup(page);
  await page.goto("http://127.0.0.1:5183");
  await selectRoute(page);
  const follow = page.getByRole("button", { name: "Follow me", exact: true });
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator('.leaflet-overlay-pane path[fill="#2677df"]'),
  ).toHaveCount(1);
  await context.setGeolocation({
    latitude: 13.005,
    longitude: 80.211,
    accuracy: 10,
  });
  await expect(page.locator(".route-pill")).toContainText("Adyar pickup");
  await expect(page.locator(".route-pill")).toContainText(
    "Airport destination",
  );
  await page.getByRole("button", { name: "Show full route" }).click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "true");
  await follow.click();
  await expect(follow).toHaveAttribute("aria-pressed", "false");
});
test("route failure clears prices and geometry and blocks booking", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/routes/alternatives", (r) =>
    r.fulfill({ status: 503, json: { error: "Road routing unavailable" } }),
  );
  await page.route("**/api/estimates", (r) =>
    r.fulfill({
      status: 503,
      json: { error: "A road quote is unavailable. Please try again later" },
    }),
  );
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Where are you going?" }).click();
  await page
    .getByRole("textbox", { name: "Pickup location", exact: true })
    .fill("Adyar");
  await page.locator("[data-live-place]").click();
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport");
  await page.locator("[data-live-place]").click();
  await expect(page.getByRole("alert")).toContainText(
    "Road routing unavailable",
  );
  await expect(page.locator('[data-vehicle="auto"] .vehicle-price')).toHaveText(
    "Unavailable",
  );
  await expect(page.locator('[data-action="review"]')).toBeDisabled();
  await expect(
    page.locator('.leaflet-overlay-pane path[fill="none"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry route and fares" }),
  ).toBeVisible();
});
test("rider cancellation immediately returns to home screen and resets phase and closes modal", async ({
  page,
}) => {
  let cancelled = false;
  const active = {
    id: "ride-cancel-test",
    version: 1,
    status: "requested",
    mine: true,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    vehicle_category: "auto",
    payment_method: "wallet",
    fare_paise: 23700,
  };
  await setup(page, () => ({
    rides: cancelled ? [] : [active],
    offers: [],
    driver: [],
  }));
  await page.route("**/api/rides/ride-cancel-test/actions", (r) => {
    cancelled = true;
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5183");
  await expect(
    page.getByRole("heading", { name: "Finding your Captain" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm cancellation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Where to next?" }),
  ).toBeVisible();
});
test("captain receives real offer, accepts with version, then sees pickup navigation", async ({
  page,
}) => {
  let accepted = false,
    action;
  const offer = {
    id: "offer-real",
    version: 3,
    status: "requested",
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    vehicle_category: "auto",
    payment_method: "cash",
    fare_paise: 23700,
  };
  await setup(page, () => ({
    rides: accepted ? [{ ...offer, driving: true, status: "accepted" }] : [],
    offers: accepted ? [] : [offer],
    driver: [{ online: true, status: "approved" }],
  }));
  await page.route("**/api/rides/offer-real/actions", (r) => {
    action = r.request().postDataJSON();
    accepted = true;
    return r.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/rides/offer-real/position", (r) =>
    r.fulfill({
      json: {
        lat: 13.006,
        lng: 80.22,
        at: new Date().toISOString(),
        stale: false,
        status: "accepted",
      },
    }),
  );
  await page.route("**/api/rides/offer-real/nav", (r) =>
    r.fulfill({
      json: {
        stale: false,
        route: road,
        steps: [
          { instruction: "Turn right at the next junction", meters: 150 },
        ],
        seconds: 120,
        meters: 900,
      },
    }),
  );
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".driver-sheet .amount")).toHaveText("₹237");
  await page.getByRole("button", { name: "Accept ride", exact: true }).click();
  await expect
    .poll(() => action)
    .toMatchObject({ action: "accept", version: 3 });
  await expect(page.locator(".route-pill strong")).toHaveText(
    "Turn right at the next junction",
  );
});
test("notification screen shows backend notices rather than sample announcements", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/api/companion", (r) =>
    r.fulfill({
      json: {
        notifications: [
          {
            id: "n1",
            title: "Captain accepted your ride",
            body: "Your Captain is on the way.",
            created_at: "2026-10-28T08:00:00Z",
          },
        ],
      },
    }),
  );
  await page.goto("http://127.0.0.1:5183");
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByText("Captain accepted your ride", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Yesterday · sample account update")).toHaveCount(
    0,
  );
});
test("phone sign-in uses backend OTP and never creates a demo session", async ({
  page,
}) => {
  await setup(page);
  let verified = false;
  const sent = [];
  await page.route("**/api/me", (r) =>
    r.fulfill(
      verified
        ? { json: { user: { id: "real-account" }, csrf: "real-csrf" } }
        : { status: 401, json: { error: "Sign in" } },
    ),
  );
  await page.route("**/auth/otp/request", (r) => {
    sent.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true, dev_code: "123456" } });
  });
  await page.route("**/auth/otp/verify", (r) => {
    expect(r.request().postDataJSON()).toEqual({
      phone: "9876543210",
      code: "123456",
    });
    verified = true;
    return r.fulfill({ json: { ok: true, csrf: "real-csrf" } });
  });
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.locator("#demo-phone").fill("9876543210");
  await page
    .getByRole("button", { name: "Send sign-in code", exact: true })
    .click();
  await page.getByLabel("Six-digit SMS code").fill("123456");
  await page
    .getByRole("button", { name: "Verify & continue", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Where to next?" }),
  ).toBeVisible();
  expect(sent).toEqual([{ phone: "9876543210" }]);
});
test("Captain pickup code is validated by the backend before the trip starts", async ({
  page,
}) => {
  let phase = "arrived";
  let attempts = [];
  const active = {
    id: "otp-ride",
    version: 5,
    driving: true,
    status: phase,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    vehicle_category: "auto",
    payment_method: "cash",
    fare_paise: 23700,
  };
  await setup(page, () => ({
    rides: [{ ...active, status: phase }],
    offers: [],
    driver: [{ online: true, status: "approved" }],
  }));
  await page.route("**/api/rides/otp-ride/position", (r) =>
    r.fulfill({
      json: {
        lat: 13.006,
        lng: 80.22,
        at: new Date().toISOString(),
        stale: false,
        status: phase,
      },
    }),
  );
  await page.route("**/api/rides/otp-ride/nav", (r) =>
    r.fulfill({
      json: {
        stale: false,
        route: road,
        steps: [{ instruction: "Continue along the road", meters: 100 }],
        seconds: 900,
        meters: 7000,
      },
    }),
  );
  await page.route("**/api/rides/otp-ride/actions", (r) => {
    const data = r.request().postDataJSON();
    attempts.push(data);
    if (data.code !== "901234")
      return r.fulfill({
        status: 400,
        json: { error: "Incorrect pickup code" },
      });
    phase = "in_progress";
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".pin-entry")).toBeVisible();
  for (let i = 0; i < 6; i++) await page.locator(`#pin-${i}`).fill("3");
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await expect.poll(() => attempts.length).toBe(1);
  await expect(page.locator(".pin-entry")).toBeVisible();
  expect(phase).toBe("arrived");
  for (const [i, digit] of [..."901234"].entries())
    await page.locator(`#pin-${i}`).fill(digit);
  await page.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(
    page.getByRole("heading", { name: "On trip", exact: true }),
  ).toBeVisible();
  expect(attempts[1]).toMatchObject({
    action: "start",
    version: 5,
    code: "901234",
  });
});
test("trip chat sends a real backend message and does not generate an automatic reply", async ({
  page,
}) => {
  const active = {
    id: "chat-ride",
    version: 2,
    status: "accepted",
    mine: true,
    pickup_lat: pickup.lat,
    pickup_lng: pickup.lng,
    dropoff_lat: dropoff.lat,
    dropoff_lng: dropoff.lng,
    pickup_label: pickup.label,
    dropoff_label: dropoff.label,
    vehicle_category: "auto",
    payment_method: "cash",
    fare_paise: 23700,
  };
  let messages = [];
  await setup(page, () => ({ rides: [active], driver: [], offers: [] }));
  await page.route("**/api/rides/chat-ride/position", (r) =>
    r.fulfill({
      json: {
        lat: 13.006,
        lng: 80.22,
        at: new Date().toISOString(),
        stale: false,
        status: "accepted",
      },
    }),
  );
  await page.route("**/api/rides/chat-ride/messages", (r) => {
    if (r.request().method() === "POST") {
      messages.push({
        body: r.request().postDataJSON().body,
        mine: true,
        sent_at: new Date().toISOString(),
      });
      return r.fulfill({ json: messages.at(-1) });
    }
    return r.fulfill({ json: { messages } });
  });
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Message", exact: true }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("At the main gate");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".chat-bubble")).toHaveCount(1);
  await expect(page.locator(".chat-bubble")).toHaveText("At the main gate");
  expect(messages).toHaveLength(1);
});
test("saved Home uses backend coordinates and can be combined with a newly selected pickup", async ({
  page,
}) => {
  await setup(page, () => ({
    rides: [],
    offers: [],
    driver: [],
    saved_locations: [
      {
        ...dropoff,
        label: "Home",
        kind: "home",
        place_label: "My saved Home address",
      },
    ],
  }));
  await page.goto("http://127.0.0.1:5183");
  await expect(page.getByRole("button", { name: /^Home / })).toBeVisible();
  // Wait for the signed-in account snapshot that supplies saved-place coordinates.
  await expect.poll(() => page.locator("[data-live-login]").count()).toBe(0);
  await page.getByRole("button", { name: /^Home / }).click();
  await page
    .getByRole("textbox", { name: "Pickup location", exact: true })
    .fill("Adyar");
  await page
    .locator("[data-live-place]")
    .filter({ hasText: "Adyar pickup" })
    .click();
  await expect(page.locator(".route-pill")).toContainText(
    "My saved Home address",
  );
  await expect(page.locator(".choose-sheet .subline")).toContainText("9.0 km");
});
test("expired quote uses the approved recovery dialog and refresh does not book automatically", async ({
  page,
}) => {
  await setup(page);
  let quotes = 0,
    bookings = 0;
  await page.route("**/api/quotes", (r) => {
    quotes++;
    return r.fulfill({
      json: {
        id: `quote-${quotes}`,
        fare_paise: 23700,
        meters: 9000,
        seconds: 1500,
        route: road,
      },
    });
  });
  await page.route("**/api/rides", (r) => {
    bookings++;
    return r.fulfill({
      status: 409,
      json: { error: "Quote expired. Please get a new quote." },
    });
  });
  await page.goto("http://127.0.0.1:5183");
  await selectRoute(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Request a ride", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Let’s refresh your fare.",
  );
  await page.getByRole("button", { name: "Refresh fare", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".confirm-sheet .badge")).toHaveText(
    "Backend quote",
  );
  expect(quotes).toBe(2);
  expect(bookings).toBe(1);
});
