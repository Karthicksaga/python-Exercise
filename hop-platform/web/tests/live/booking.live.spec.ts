import { test, expect } from "@playwright/test";
// Runs only against an explicitly selected development environment and test account.
const enabled =
  !!process.env.HOP_LIVE_RIDER_URL && !!process.env.HOP_LIVE_STORAGE_STATE;
test.skip(
  !enabled,
  "Set HOP_LIVE_RIDER_URL and HOP_LIVE_STORAGE_STATE for a signed-in development test account.",
);
test("live Maps, autocomplete and quote refresh", async ({ page }) => {
  const config = await page.request.get("/api/config");
  expect(config.ok()).toBe(true);
  expect(
    (await config.json()).development,
    "Live booking tests require a development environment",
  ).toBe(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Where are you heading?" }),
  ).toBeVisible();
  const query = process.env.HOP_LIVE_DESTINATION;
  test.skip(
    !query,
    "Set HOP_LIVE_DESTINATION to a real destination within the development service area.",
  );
  const destination = page.getByRole("combobox", {
    name: "Destination",
    exact: true,
  });
  const search = page.waitForResponse(
    (r) => r.url().includes("/api/places") && r.ok(),
  );
  await destination.fill(query!);
  // No route interception: suggestions and quote must come from the configured providers.
  await destination.press("Enter");
  await search;
  await page.locator(".places-list .place-row").first().click();
  await page
    .getByRole("button", { name: "Choose a ride", exact: true })
    .click();
  await expect(page.locator(".booking-map")).toBeVisible();
  await expect(page.locator(".booking-map .gm-style")).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(".quote")).toBeVisible();
  const quote = page.waitForResponse(
    (r) => r.url().endsWith("/api/quotes") && r.ok(),
  );
  await page
    .getByRole("button", { name: "Refresh quote", exact: true })
    .click();
  await quote;
  await expect(page.getByRole("button", { name: /^Request / })).toBeEnabled();
  // Creating a real development ride requires a second explicit opt-in.
  if (process.env.HOP_LIVE_CREATE_RIDE === "1") {
    const booked = page.waitForResponse(
      (r) => r.url().endsWith("/api/rides") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^Request / }).click();
    expect((await booked).ok()).toBe(true);
  }
});
