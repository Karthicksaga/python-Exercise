import { test, expect } from "@playwright/test";
for (const [role, port] of [
  ["rider", 5183],
  ["captain", 5184],
]) {
  test(`${role} login prototype shows SMS, error and success states without API calls`, async ({
    page,
  }) => {
    const calls = [];
    page.on("request", (r) => {
      if (/\/api\/|\/auth\//.test(r.url())) calls.push(r.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/?prototype=login`);
    await expect(page.locator(".login-hero")).toBeVisible();
    await expect(page.locator(".login-wordmark")).toContainText(
      role.toUpperCase(),
    );
    await page
      .getByRole("button", { name: "Send sign-in code", exact: true })
      .click();
    await expect(page.getByLabel("Six-digit SMS code")).toBeVisible();
    await page.getByRole("button", { name: "Preview code error" }).click();
    await expect(page.getByRole("alert")).toContainText("Try again");
    await page
      .getByRole("button", { name: "Verify & continue", exact: true })
      .click();
    await expect(page.locator(".login-feedback")).toContainText(
      "simulated success",
    );
    expect(calls).toEqual([]);
  });
  test(`${role} payment prototype distinguishes pending, verified, failed, cash and refunds`, async ({
    page,
  }) => {
    const calls = [];
    page.on("request", (r) => {
      if (/\/api\/|\/auth\//.test(r.url())) calls.push(r.url());
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`http://127.0.0.1:${port}/?prototype=payment`);
    await page
      .getByRole("button", {
        name: role === "rider" ? "Continue with UPI" : "Check payment status",
        exact: true,
      })
      .click();
    await expect(page.locator(".payment-status-label")).toHaveText(
      "PAYMENT STARTED",
    );
    await page.getByRole("button", { name: "Simulate pending status" }).click();
    await expect(page.locator(".payment-status-label")).toContainText(
      "WAITING",
    );
    await page.getByRole("button", { name: "Simulate failed payment" }).click();
    await expect(
      page.getByRole("heading", { name: "Let’s try another way." }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Retry verification" }).click();
    await page
      .getByRole("button", { name: "Simulate verified success" })
      .click();
    await expect(
      page.getByText("Simulated backend confirmation"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Preview refund status" }).click();
    await expect(page.locator(".payment-timeline")).toContainText("Processing");
    await page
      .getByRole("button", { name: "Back to prototype", exact: true })
      .click();
    await page.getByRole("radio", { name: /Cash Pay your Captain/ }).click();
    await page
      .getByRole("button", {
        name: role === "rider" ? "Choose cash" : "Record cash received",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name:
          role === "rider"
            ? "Preview Captain confirms receipt"
            : "Preview cash receipt recorded",
      })
      .click();
    await expect(
      page.getByText("Captain reported received", { exact: true }),
    ).toBeVisible();
    expect(calls).toEqual([]);
  });
  test(`${role} recovery prototypes fit a short phone and keep actions anchored`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(`http://127.0.0.1:${port}/?prototype=states`);
    for (const state of [
      "location",
      "empty",
      "drivers",
      "expired",
      "offline",
      "taken",
      "cancel",
      "notifications",
    ]) {
      await page.locator(`[data-state-preview="${state}"]`).first().click();
      const footer = await page.locator(".action-bar").boundingBox();
      expect(footer.y + footer.height).toBeLessThanOrEqual(640);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  });
}
test("destination search uses Chennai rather than the first configured area and errors survive re-render", async ({
  page,
}) => {
  const areas = [
    {
      id: "delhi",
      name: "Delhi NCR",
      min_lat: 28.35,
      max_lat: 28.9,
      min_lng: 76.8,
      max_lng: 77.6,
    },
    {
      id: "chennai",
      name: "Chennai",
      min_lat: 12.85,
      max_lat: 13.25,
      min_lng: 80,
      max_lng: 80.4,
    },
  ];
  let selected = "",
    fail = false;
  await page.route("https://maps.googleapis.com/**", (r) => r.abort());
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:5183\/api\//, (r) =>
    r.fulfill({ json: {} }),
  );
  await page.route("**/api/config", (r) =>
    r.fulfill({ json: { areas, vehicles: [], development: true } }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "rider" }, csrf: "csrf" } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({ json: { rides: [], offers: [], driver: [] } }),
  );
  await page.route("**/api/places?*", (r) => {
    selected = new URL(r.request().url()).searchParams.get("area_id");
    return r.fulfill(
      fail
        ? {
            status: 503,
            json: { error: "Address search is temporarily unavailable" },
          }
        : { json: [{ label: "Chennai Airport", lat: 12.99, lng: 80.17 }] },
    );
  });
  await page.goto("http://127.0.0.1:5183");
  await page.getByRole("button", { name: "Where are you going?" }).click();
  await expect(page.getByRole("combobox", { name: "Search city" })).toHaveValue(
    "chennai",
  );
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport");
  await expect(page.locator("[data-live-place]")).toContainText(
    "Chennai Airport",
  );
  expect(selected).toBe("chennai");
  fail = true;
  await page
    .getByRole("textbox", { name: "Search destination" })
    .fill("Airport road");
  await expect(page.locator(".search-feedback")).toContainText(
    "temporarily unavailable",
  );
  // Trigger the same live-state refresh used in production, without requiring
  // review-only screen controls in the standalone app.
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('hop-live-state',{detail:{rides:[],offers:[],driver:[]}})));
  await expect(page.locator(".search-feedback")).toContainText(
    "temporarily unavailable",
  );
});
test("Hop Commute is disabled in the mobile app", async ({ page }) => {
  await page.goto("http://127.0.0.1:5183/?map=reference");
  await expect(
    page.getByRole("button", { name: "Commute · Coming later" }),
  ).toBeDisabled();
});
