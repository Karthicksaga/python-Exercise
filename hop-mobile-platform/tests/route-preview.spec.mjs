import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:5183";
const pickup = { lat: 13.0067, lng: 80.2206, label: "2nd Cross Street, Alandur" };
const dropoff = { lat: 12.994, lng: 80.17, label: "Trident, Chennai" };
const road = [
  pickup,
  { lat: 13.004, lng: 80.21 },
  { lat: 13.001, lng: 80.195 },
  { lat: 12.998, lng: 80.18 },
  dropoff,
];

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);

async function setupApp(page) {
  let routesCount = 0;
  await page.route("https://maps.googleapis.com/**", (r) => r.abort());
  await page.route("https://tile.openstreetmap.org/**", (r) =>
    r.fulfill({ contentType: "image/png", body: pixel }),
  );
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "rider-1" }, csrf: "csrf-token" } }),
  );
  await page.route("**/api/routes/alternatives", (r) => {
    routesCount++;
    r.fulfill({ json: { routes: [{ route: road, meters: 8500, seconds: 1200 }] } });
  });
  await page.route("**/api/estimates", (r) =>
    r.fulfill({ json: { options: [{ category: "sedan", fare_paise: 16159 }] } }),
  );

  await page.goto(base);
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  await expect(page.locator(".hop-map-status")).toContainText("OpenStreetMap");
  return { getRoutesCount: () => routesCount };
}

test.describe("Premium Animated Route Preview & Action Bar Polish", () => {
  test("Review Your Ride screen displays animated route preview and replay/skip controls", async ({
    page,
  }) => {
    const tracker = await setupApp(page);

    // Enter review screen with mock planned route
    await page.evaluate(
      ({ pickup, dropoff, road }) => {
        const bridge = window.prototypeBridge;
        if (bridge) {
          bridge.assign({
            pickup: pickup.label,
            destination: dropoff.label,
            vehicle: "sedan",
          });
          bridge.go("confirm");
        }
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: {
              pickup,
              dropoff,
              route: road,
              center: pickup,
            },
          }),
        );
      },
      { pickup, dropoff, road },
    );

    // Verify Review Your Ride screen is visible
    await expect(page.locator(".confirm-sheet")).toBeVisible();

    // Verify Route Preview Badge is present on map
    const previewBadge = page.locator(".route-preview-badge");
    await expect(previewBadge).toBeVisible();

    // During animation or at start, either 'Skip' or 'Replay route' is rendered
    const badgeText = await previewBadge.textContent();
    expect(badgeText).toMatch(/Skip|Replay route/);

    // When animation is active, clicking skip finishes cleanly
    if ((await page.locator('[data-action="skip-preview"]').count()) > 0) {
      await page.locator('[data-action="skip-preview"]').click();
    }

    // After completion, the badge offers replay
    await expect(page.locator('[data-action="replay-preview"]')).toBeVisible();

    // Replay control restarts preview
    await page.locator('[data-action="replay-preview"]').click();
    await expect(page.locator(".route-preview-badge")).toBeVisible();

    // Ensure no additional route API requests were issued during preview animation
    expect(tracker.getRoutesCount()).toBeLessThanOrEqual(1);
  });

  test("Manual map interaction interrupts camera following without error", async ({
    page,
  }) => {
    await setupApp(page);

    await page.evaluate(
      ({ pickup, dropoff, road }) => {
        const bridge = window.prototypeBridge;
        if (bridge) {
          bridge.assign({
            pickup: pickup.label,
            destination: dropoff.label,
            vehicle: "sedan",
          });
          bridge.go("confirm");
        }
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: { pickup, dropoff, route: road, center: pickup },
          }),
        );
      },
      { pickup, dropoff, road },
    );

    await expect(page.locator(".confirm-sheet")).toBeVisible();

    // Simulate user drag event
    await page.evaluate(() => {
      window.dispatchEvent(new Event("hop-map-drag"));
    });

    // Verify map remains responsive and doesn't crash
    await expect(page.locator(".route-preview-badge")).toBeVisible();
  });

  test("Leaving confirm screen cleanly stops active preview animation", async ({
    page,
  }) => {
    await setupApp(page);

    await page.evaluate(
      ({ pickup, dropoff, road }) => {
        const bridge = window.prototypeBridge;
        if (bridge) {
          bridge.assign({
            pickup: pickup.label,
            destination: dropoff.label,
            vehicle: "sedan",
          });
          bridge.go("confirm");
        }
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: { pickup, dropoff, route: road, center: pickup },
          }),
        );
      },
      { pickup, dropoff, road },
    );

    await expect(page.locator(".confirm-sheet")).toBeVisible();

    // Navigate away to activity tab
    await page.evaluate(() => {
      const bridge = window.prototypeBridge;
      if (bridge) bridge.go("activity");
    });

    // Route preview badge must be removed
    await expect(page.locator(".route-preview-badge")).toHaveCount(0);
  });

  test("Action bar layout on Review your ride renders fare, action button, and centered fineprint", async ({
    page,
  }) => {
    await setupApp(page);

    await page.evaluate(
      ({ pickup, dropoff, road }) => {
        const bridge = window.prototypeBridge;
        if (bridge) {
          bridge.assign({
            pickup: pickup.label,
            destination: dropoff.label,
            vehicle: "sedan",
          });
          bridge.go("confirm");
        }
        window.dispatchEvent(
          new CustomEvent("hop-planned-route", {
            detail: { pickup, dropoff, route: road, center: pickup },
          }),
        );
      },
      { pickup, dropoff, road },
    );

    const actionBar = page.locator(".action-bar");
    await expect(actionBar).toBeVisible();

    const priceBtn = actionBar.locator(".footer-price");
    const requestBtn = actionBar.locator(".primary");
    const fineprint = actionBar.locator(".fineprint");

    await expect(priceBtn).toBeVisible();
    await expect(requestBtn).toBeVisible();
    await expect(fineprint).toBeVisible();

    // Verify fineprint is laid out below buttons, not squeezed as a narrow column
    const priceBox = await priceBtn.boundingBox();
    const requestBox = await requestBtn.boundingBox();
    const fineBox = await fineprint.boundingBox();

    expect(priceBox).toBeTruthy();
    expect(requestBox).toBeTruthy();
    expect(fineBox).toBeTruthy();

    // Price button and Request button are side-by-side on the first row
    expect(Math.abs(priceBox.y - requestBox.y)).toBeLessThan(15);
    // Fineprint is below the action button
    expect(fineBox.y).toBeGreaterThanOrEqual(requestBox.y + requestBox.height - 2);
    // Fineprint has wide width (spanning across the container)
    expect(fineBox.width).toBeGreaterThan(200);
  });

  test("Ride preferences screen has single canonical Save button in bottom bar without duplication", async ({
    page,
  }) => {
    await setupApp(page);

    // Navigate to preferences screen via account tab
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="preferences"]').click();

    await expect(page.getByRole("heading", { name: "Ride preferences" })).toBeVisible();

    // Ensure there is only 1 'Save preferences' button on screen
    const saveButtons = page.getByRole("button", { name: /Save preferences/ });
    await expect(saveButtons).toHaveCount(1);

    // And it resides in the action-bar
    await expect(page.locator(".action-bar button")).toContainText("Save preferences");
  });
});
