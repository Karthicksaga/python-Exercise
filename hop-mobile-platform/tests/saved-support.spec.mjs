import { test, expect } from "@playwright/test";

async function setupFixture(page, { role = "rider", saved_locations = [], contacts = [] } = {}) {
  const posts = [];
  let state = {
    rides: [
      {
        id: "trip-1",
        mine: true,
        driving: false,
        pickup_label: "Adyar Depot",
        dropoff_label: "Guindy Station",
        status: "completed",
      },
    ],
    offers: [],
    driver: role === "captain" ? [{ status: "approved" }] : [],
    saved_locations: [...saved_locations],
  };

  let profile = {
    name: role === "captain" ? "Arun Captain" : "Deepa Rider",
    phone: "9876543210",
    phone_verified: true,
    email: "deepa@example.com",
    contacts: [...contacts],
  };

  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;
    if (body) posts.push({ path: p, body });

    if (p === "/api/config") {
      return r.fulfill({
        json: {
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
        },
      });
    }
    if (p === "/api/me") {
      return r.fulfill({
        json: { user: { id: role === "captain" ? "captain-1" : "rider-1" }, csrf: "csrf" },
      });
    }
    if (p === "/api/state") {
      return r.fulfill({ json: state });
    }
    if (p === "/api/profile") {
      return r.fulfill({ json: { details: [profile], contacts: profile.contacts } });
    }
    if (p === "/api/locations") {
      const newLoc = { id: `loc-${Date.now()}`, ...body };
      state.saved_locations.push(newLoc);
      return r.fulfill({ json: { id: newLoc.id } });
    }
    if (p.startsWith("/api/locations/") && p.endsWith("/delete")) {
      const id = p.split("/")[3];
      state.saved_locations = state.saved_locations.filter((l) => l.id !== id);
      return r.fulfill({ json: { ok: true } });
    }
    if (p === "/api/profile/contacts") {
      const newContact = { id: `c-${Date.now()}`, ...body };
      profile.contacts.push(newContact);
      return r.fulfill({ json: { ok: true } });
    }
    if (p.startsWith("/api/profile/contacts/") && p.endsWith("/delete")) {
      const id = p.split("/")[4];
      profile.contacts = profile.contacts.filter((c) => c.id !== id);
      return r.fulfill({ json: { ok: true } });
    }
    if (p === "/api/companion") {
      return r.fulfill({
        json: {
          scheduled_rides: [],
          family: [],
          preferences: { language: "en", notifications_enabled: true },
        },
      });
    }
    return r.fulfill({ json: {} });
  });

  const port = role === "captain" ? "5184" : "5183";
  await page.goto(`http://127.0.0.1:${port}`);
  await expect(page.locator("#app[data-ready=true]")).toBeVisible();
  return { posts, getState: () => state, getProfile: () => profile };
}

test("Saved places screen renders canonical subtitle, quick suggestions, and allows adding a place", async ({ page }) => {
  const { posts } = await setupFixture(page, { role: "rider", saved_locations: [] });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="saved"]').click();

  // Verify header & subtitle
  await expect(page.locator("header h1")).toHaveText("Saved places");
  await expect(page.locator(".screen-padding > p.small.muted")).toHaveText(
    "A few familiar places. A little less typing.",
  );

  // Verify quick suggestions appear when list is empty
  const suggestionsLabel = page.locator(".section-label:has-text('Quick suggestions')");
  await expect(suggestionsLabel).toBeVisible();

  // Click Add on Home suggestion
  const addHomeBtn = page.locator('[data-account-quick-place="home"]');
  await expect(addHomeBtn).toBeVisible();
  await addHomeBtn.click();

  // Verify form inputs populated
  await expect(page.locator("#account-location-kind")).toHaveValue("home");
  await expect(page.locator("#account-location-label")).toHaveValue("Home");
  await expect(page.locator("#account-location-address")).toHaveValue("2nd Cross Street, Adyar");

  // Click Save destination
  const saveBtn = page.locator('[data-account-action="save-location"]');
  await expect(saveBtn).toContainText("Save destination");
  await saveBtn.click();

  // Verify API call was made
  await expect.poll(() => posts.some((p) => p.path === "/api/locations")).toBeTruthy();
  const locPost = posts.find((p) => p.path === "/api/locations");
  expect(locPost.body).toMatchObject({
    kind: "home",
    label: "Home",
    place_label: "2nd Cross Street, Adyar",
  });

  // Verify notice box explaining location selection is present
  await expect(page.locator(".screen-padding > .notice-box")).toBeVisible();
});

test("Saved places screen renders existing saved locations with delete/remove action", async ({ page }) => {
  const existingLocations = [
    {
      id: "loc-home-1",
      kind: "home",
      label: "My Sweet Home",
      place_label: "4th Main Road, Gandhi Nagar, Adyar",
      lat: 13.0067,
      lng: 80.255,
    },
    {
      id: "loc-work-1",
      kind: "work",
      label: "Tech Office",
      place_label: "Tidel Park, Tharamani",
      lat: 12.989,
      lng: 80.245,
    },
  ];

  const { posts } = await setupFixture(page, {
    role: "rider",
    saved_locations: existingLocations,
  });

  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="saved"]').click();

  // Verify both locations are rendered with labels and details
  await expect(page.locator('.list-row:has-text("My Sweet Home")')).toBeVisible();
  await expect(page.locator('.list-row:has-text("4th Main Road, Gandhi Nagar, Adyar")')).toBeVisible();
  await expect(page.locator('.list-row:has-text("Tech Office")')).toBeVisible();

  // Remove first location
  const deleteBtn = page.locator('[data-account-location-delete="loc-home-1"]');
  await expect(deleteBtn).toBeVisible();
  await deleteBtn.click();

  // Verify delete API call
  await expect.poll(() => posts.some((p) => p.path === "/api/locations/loc-home-1/delete")).toBeTruthy();
});

test("Help & support screen renders canonical hero, quick grid tiles, and modal rows", async ({ page }) => {
  await setupFixture(page, { role: "rider" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="support"]').click();

  // Verify header
  await expect(page.locator("header h1")).toHaveText("Help & support");

  // Verify help hero
  const hero = page.locator(".help-hero");
  await expect(hero).toBeVisible();
  await expect(hero.locator("h2")).toHaveText("How can we help?");
  await expect(hero.locator("p")).toHaveText("Let’s get you to the right place.");

  // Verify quick grid tiles
  const grid = page.locator(".quick-grid");
  await expect(grid).toBeVisible();
  await expect(grid.locator('.quick-tile:has-text("Trip issue")')).toBeVisible();
  await expect(grid.locator('.quick-tile:has-text("Payments")')).toBeVisible();
  await expect(grid.locator('.quick-tile:has-text("Account")')).toBeVisible();
  await expect(grid.locator('.quick-tile:has-text("Safety")')).toBeVisible();

  // Verify section label and modal rows
  await expect(page.locator('.section-label:has-text("More help")')).toBeVisible();
  await expect(page.locator('.list-row:has-text("I left something behind")')).toBeVisible();
  await expect(page.locator('.list-row:has-text("Report an issue")')).toBeVisible();
  await expect(page.locator('.list-row:has-text("Call or email support")')).toBeVisible();
});

test("Support contact modal sheet displays operator helpline, email details, and closes cleanly", async ({ page }) => {
  await setupFixture(page, { role: "rider" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="support"]').click();

  // Open support contact modal
  await page.locator('[data-modal="support-contact"]').click();

  const sheet = page.locator(".modal-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#modal-title")).toHaveText("Call or email support");

  // Verify helpline and email cards
  await expect(sheet.locator('text="1800-200-HOP (467)"')).toBeVisible();
  await expect(sheet.locator('text="support@hop.app"')).toBeVisible();
  await expect(sheet.locator('text="24/7 Helpline"')).toBeVisible();

  // Close modal sheet
  await sheet.locator('button[data-action="close-modal"]:has-text("Close")').click();
  await expect(sheet).toBeHidden();
});

test("Emergency contacts modal sheet displays form and touch targets >= 44px", async ({ page }) => {
  await setupFixture(page, {
    role: "rider",
    contacts: [{ id: "c-1", name: "Ramesh", phone: "9876543211", relation: "Brother" }],
  });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="safety"]').click();
  await page.locator('[data-modal="contacts"]').click();

  const sheet = page.locator(".modal-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.locator("#modal-title")).toHaveText("Emergency contacts");

  // Verify existing contact is shown
  await expect(sheet.locator('text="Ramesh"')).toBeVisible();
  await expect(sheet.locator('text="9876543211 · Brother"')).toBeVisible();

  // Verify touch targets for button and remove action >= 44px
  const removeBtn = sheet.locator('[data-account-delete-contact="c-1"]');
  const removeBox = await removeBtn.boundingBox();
  expect(removeBox.height).toBeGreaterThanOrEqual(44);

  const saveContactBtn = sheet.locator('[data-account-action="contact"]');
  const saveBox = await saveContactBtn.boundingBox();
  expect(saveBox.height).toBeGreaterThanOrEqual(44);
});

test("Lost item and report modal sheets preserve selectors, structure, and touch targets >= 44px", async ({ page }) => {
  await setupFixture(page, { role: "rider" });
  await page.locator('[data-go="account"]').first().click();
  await page.locator('[data-go="support"]').click();

  // 1. Lost item modal
  await page.locator('[data-modal="lost-item"]').click();
  const lostSheet = page.locator(".modal-sheet");
  await expect(lostSheet).toBeVisible();
  await expect(lostSheet.getByLabel("Trip", { exact: true })).toBeVisible();
  await expect(lostSheet.getByLabel("Describe the item")).toBeVisible();
  const lostSubmit = lostSheet.locator('[data-account-action="lost-item"]');
  const lostBox = await lostSubmit.boundingBox();
  expect(lostBox.height).toBeGreaterThanOrEqual(44);

  // Close lost item modal
  await lostSheet.locator('button[aria-label="Close dialog"]').click();
  await expect(lostSheet).toBeHidden();

  // 2. Report issue modal
  await page.locator('[data-modal="report"]').first().click();
  const reportSheet = page.locator(".modal-sheet");
  await expect(reportSheet).toBeVisible();
  await expect(reportSheet.getByLabel("Trip", { exact: true })).toBeVisible();
  await expect(reportSheet.getByLabel("Describe the issue")).toBeVisible();
  const reportSubmit = reportSheet.locator('[data-account-action="report"]');
  const reportBox = await reportSubmit.boundingBox();
  expect(reportBox.height).toBeGreaterThanOrEqual(44);
});
