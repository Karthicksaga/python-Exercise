import { test, expect } from "@playwright/test";

const pickup = { lat: 13.0067, lng: 80.2206, label: "Adyar pickup" };
const dropoff = { lat: 12.994, lng: 80.17, label: "Airport destination" };

const activeTrip = {
  id: "ride-active-123",
  mine: true,
  version: 3,
  status: "in_progress",
  pickup_lat: pickup.lat,
  pickup_lng: pickup.lng,
  dropoff_lat: dropoff.lat,
  dropoff_lng: dropoff.lng,
  pickup_label: "Adyar Gateway",
  dropoff_label: "Chennai Airport Terminal 2",
  vehicle_category: "auto",
  payment_method: "cash",
  fare_paise: 24500,
  driver_name: "Captain Arun",
  vehicle_number: "TN 09 AB 1234",
  created_at: "2026-10-30T10:00:00Z",
};

async function setupApp(page, { rides = [] } = {}) {
  const posts = [];
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body) posts.push({ path: p, body });

    let json = {};
    if (p === "/api/config") {
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
    } else if (p === "/api/me") {
      json = { user: { id: "rider-1" }, csrf: "csrf-token" };
    } else if (p === "/api/state") {
      json = { rides, offers: [], driver: [] };
    } else if (p === "/api/profile") {
      json = {
        details: [
          {
            id: "rider-1",
            name: "Anand R",
            phone: "9876543210",
            phone_verified: true,
          },
        ],
        contacts: [
          { id: "c1", name: "Deepa", phone: "+91 98401 23456", relation: "Sister" },
        ],
      };
    } else if (p === "/api/companion") {
      json = {
        scheduled_rides: [],
        family: [],
        preferences: { language: "en", notifications_enabled: true },
      };
    } else if (p.endsWith("/share")) {
      json = { path: "/shared/ride-active-123" };
    } else if (p.endsWith("/sos")) {
      json = { status: "received" };
    }
    await r.fulfill({ json });
  });

  await page.context().clearCookies();
  await page.goto("http://127.0.0.1:5183");
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  if (rides.length > 0) {
    await page.evaluate((r) => {
      window.dispatchEvent(
        new CustomEvent("hop-live-state", {
          detail: { rides: r, offers: [], driver: [] },
        }),
      );
    }, rides);
  }
  return posts;
}

test.describe("Safety Centre Specification Tests", () => {
  test("Requirement 1 & 2: Header title 'Safety Centre', back button and hero introduction", async ({
    page,
  }) => {
    await setupApp(page);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="safety"]').click();

    // 1. Header checks
    const headerTitle = page.locator("header.app-head h1, header h1");
    await expect(headerTitle).toHaveText("Safety Centre");

    const backButton = page.locator('header [data-action="back"]');
    await expect(backButton).toBeVisible();

    // 2. Introduction checks in .safety-hero
    const hero = page.locator(".safety-hero");
    await expect(hero).toBeVisible();
    await expect(hero.locator("h2")).toHaveText("A little peace of mind.");
    await expect(hero.locator("p")).toHaveText("Your safety matters on every journey.");
    await expect(hero.locator("svg.icon")).toBeVisible();

    // Test back button functionality
    await backButton.click();
    await expect(page.locator(".account-hero")).toBeVisible();
  });

  test("Requirement 3: Primary Safety Action cards (Emergency Help and Share Your Trip)", async ({
    page,
  }) => {
    await setupApp(page);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="safety"]').click();

    // Emergency Help card
    const emergencyCard = page.locator('[data-modal="sos"]');
    await expect(emergencyCard).toBeVisible();
    await expect(emergencyCard.locator("strong")).toHaveText("Emergency Help");
    await expect(emergencyCard.locator("small")).toHaveText("Quick incident alert to Hop operator");
    await expect(emergencyCard).toHaveClass(/quick-tile-emergency/);

    // Share Your Trip card
    const shareCard = page.locator('[data-modal="share"]');
    await expect(shareCard).toBeVisible();
    await expect(shareCard.locator("strong")).toHaveText("Share Your Trip");
    await expect(shareCard.locator("small")).toHaveText("Let trusted people follow your live ride");

    // Touch targets >= 44px
    const emBox = await emergencyCard.boundingBox();
    const shareBox = await shareCard.boundingBox();
    expect(emBox.height).toBeGreaterThanOrEqual(44);
    expect(shareBox.height).toBeGreaterThanOrEqual(44);
  });

  test("Requirement 4 & 5: Additional Safety Options & Disclaimer Notice Box", async ({
    page,
  }) => {
    await setupApp(page);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="safety"]').click();

    // Additional modal navigation rows
    const contactsRow = page.locator('.list-row[data-modal="contacts"]');
    await expect(contactsRow).toBeVisible();
    await expect(contactsRow.locator("strong")).toHaveText("Emergency contacts");
    await expect(contactsRow.locator("small")).toHaveText("Manage trusted contacts");

    const reportRow = page.locator('.list-row[data-modal="report"]');
    await expect(reportRow).toBeVisible();
    await expect(reportRow.locator("strong")).toHaveText("Report a safety concern");
    await expect(reportRow.locator("small")).toHaveText("Tell us about an incident or driver");

    const ridecheckRow = page.locator('.list-row[data-modal="ridecheck"]');
    await expect(ridecheckRow).toBeVisible();
    await expect(ridecheckRow.locator("strong")).toHaveText("RideCheck™ Safety Monitor");
    await expect(ridecheckRow.locator("small")).toHaveText("Anomaly & unexpected stop detection");

    const guidanceRow = page.locator('.list-row[data-modal="safety-guidance"]');
    await expect(guidanceRow).toBeVisible();
    await expect(guidanceRow.locator("strong")).toHaveText("Safety guidance");
    await expect(guidanceRow.locator("small")).toHaveText("Verify your vehicle and pickup code");

    // Disclaimer in notice-box
    const noticeBox = page.locator(".screen-padding > .notice-box");
    await expect(noticeBox).toBeVisible();
    await expect(noticeBox).toContainText(
      "An app SOS creates an operator incident. It does not contact emergency services. For immediate help, use your phone's emergency calling function."
    );
  });

  test("Requirement 6: Modal sheets for RideCheck, Safety Guidance, SOS and Share", async ({
    page,
  }) => {
    // Part A: Modals without an active trip (opened from Account -> Safety Centre)
    await setupApp(page);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="safety"]').click();

    // 1. RideCheck modal
    await page.locator('.list-row[data-modal="ridecheck"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-title h2")).toHaveText("RideCheck™ Safety Monitor");
    const closeBtn = page.locator('.modal-sheet [data-action="close-modal"]').first();
    const box = await closeBtn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await closeBtn.click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();

    // 2. Safety Guidance modal
    await page.locator('.list-row[data-modal="safety-guidance"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-title h2")).toHaveText("Safety Guidance");
    await expect(page.locator(".modal-sheet")).toContainText("Verify vehicle & plate number");
    await page.locator('.modal-sheet [data-action="close-modal"]').first().click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();

    // 3. SOS Modal without active trip -> explains no active trip and offers direct 112 call
    await page.locator('[data-modal="sos"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-sheet")).toContainText("No Active Trip Found");
    const call112 = page.locator('.modal-sheet a[href="tel:112"]');
    await expect(call112).toBeVisible();
    const callBox = await call112.boundingBox();
    expect(callBox.height).toBeGreaterThanOrEqual(44);
    await page.locator('.modal-sheet [data-action="close-modal"]').first().click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();

    // 4. Share Trip Modal without active trip -> explains no active journey
    await page.locator('[data-modal="share"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-sheet")).toContainText("No Active Journey");
    await page.locator('.modal-sheet [data-action="close-modal"]').first().click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();
  });

  test("Requirement 6 (Continued): SOS and Share modals with active live trip", async ({
    page,
  }) => {
    const posts = await setupApp(page, { rides: [activeTrip] });

    // Active ride automatically mounts tracking screen with top-right Safety Centre shield button
    await expect(page.locator('header [data-go="safety"]')).toBeVisible();
    await page.locator('header [data-go="safety"]').click();

    // 1. SOS Modal with active trip
    await page.locator('[data-modal="sos"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-sheet")).toContainText("CURRENT ASSIGNED TRIP");
    await expect(page.locator(".modal-sheet")).toContainText("Adyar Gateway");
    const sosBtn = page.locator('.modal-sheet [data-account-action="sos"]');
    await expect(sosBtn).toBeVisible();
    const sosBox = await sosBtn.boundingBox();
    expect(sosBox.height).toBeGreaterThanOrEqual(44);
    await sosBtn.click();
    await expect(page.locator(".modal-sheet")).toContainText("SOS incident sent to the operator");
    expect(posts.some((p) => p.path.endsWith("/sos"))).toBe(true);
    await page.locator('.modal-sheet [data-action="close-modal"]').first().click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();

    // 2. Share Trip Modal with active trip
    await page.locator('[data-modal="share"]').click();
    await expect(page.locator(".modal-sheet")).toBeVisible();
    await expect(page.locator(".modal-sheet")).toContainText("ACTIVE TRIP");
    const shareBtn = page.locator('.modal-sheet [data-account-action="share"]');
    await expect(shareBtn).toBeVisible();
    const shareBox = await shareBtn.boundingBox();
    expect(shareBox.height).toBeGreaterThanOrEqual(44);
    await shareBtn.click();
    await expect(page.locator(".modal-sheet input#trip-share-link")).toBeVisible();
    expect(posts.some((p) => p.path.endsWith("/share"))).toBe(true);
    await page.locator('.modal-sheet [data-action="close-modal"]').first().click();
    await expect(page.locator(".modal-sheet")).not.toBeVisible();
  });

  test("Requirement 7: Responsive and visual stability across viewports without horizontal overflow", async ({
    page,
  }) => {
    await setupApp(page);
    await page.locator('[data-go="account"]').first().click();
    await page.locator('[data-go="safety"]').click();

    const viewports = [
      { name: "Small Phone 320px", width: 320, height: 568 },
      { name: "Small Phone 375px", width: 375, height: 667 },
      { name: "Standard Phone 390px", width: 390, height: 844 },
      { name: "Standard Phone 430px", width: 430, height: 932 },
      { name: "Tablet 768px", width: 768, height: 1024 },
      { name: "Desktop 1280px", width: 1280, height: 800 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);

      // Verify no horizontal overflow on the scroll container
      const overflow = await page.evaluate(() => {
        const screenBody = document.querySelector(".screen-body");
        const screenPadding = document.querySelector(".screen-padding");
        const bodyOverflow = screenBody ? screenBody.scrollWidth > screenBody.clientWidth : false;
        const paddingOverflow = screenPadding ? screenPadding.scrollWidth > screenPadding.clientWidth : false;
        return { bodyOverflow, paddingOverflow };
      });

      expect(overflow.bodyOverflow, `Horizontal overflow in screen-body on ${vp.name}`).toBe(false);
      expect(overflow.paddingOverflow, `Horizontal overflow in screen-padding on ${vp.name}`).toBe(false);

      // Ensure key safety elements are visible
      await expect(page.locator(".safety-hero")).toBeVisible();
      await expect(page.locator('[data-modal="sos"]')).toBeVisible();
      await expect(page.locator('[data-modal="share"]')).toBeVisible();
    }
  });
});
