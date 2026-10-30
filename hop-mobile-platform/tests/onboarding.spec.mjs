import { test, expect } from "@playwright/test";
async function setup(
  page,
  { failSave = false, failSubmit = false, step = 0 } = {},
) {
  const calls = [];
  const draft = {
    step,
    area_id: "bengaluru",
    vehicle_category: "bike",
    vehicle_number: "KA01AB1234",
    vehicle_make: "Honda",
    vehicle_model: "Activa",
    vehicle_color: "Black",
    license_reference: "DL12345",
    insurance_reference: "POL12345",
    license_expires: "2030-12-31",
    insurance_expires: "2030-12-31",
  };
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    const body =
      r.request().method() === "POST" ? r.request().postDataJSON() : undefined;
    if (body) calls.push({ path, body });
    let json = {};
    if (path === "/api/config")
      json = {
        areas: ["Chennai", "Bengaluru"].map((name) => ({
          id: name.toLowerCase(),
          name,
          min_lat: 12,
          max_lat: 14,
          min_lng: 77,
          max_lng: 81,
        })),
        vehicles: [],
        development: true,
      };
    if (path === "/api/me") json = { user: { id: "captain" }, csrf: "test" };
    if (path === "/api/state") json = { driver: [], rides: [], offers: [] };
    if (path === "/api/profile")
      json = { details: [{ name: "Real Captain", phone: "9876543210" }] };
    if (path === "/api/drivers/onboarding") {
      if (body && failSave)
        return r.fulfill({ status: 500, json: { error: "Draft save failed" } });
      json = {
        draft,
        phone_verified: true,
        has_photo: true,
        documents: ["license", "rc", "insurance", "identity"].map((kind) => ({
          kind,
        })),
      };
    }
    if (path === "/api/drivers/apply" && failSubmit)
      return r.fulfill({
        status: 400,
        json: { error: "Application rejected by server" },
      });
    await r.fulfill({ json });
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  if (step === 0) await expect(page.getByLabel("Your legal name")).toHaveValue("Real Captain");
  else await expect(page.locator("[data-captain-onboarding]")).toContainText("Real Captain");
  return calls;
}
test("Captain resumes real city draft and cannot advance on failed save", async ({
  page,
}) => {
  const calls = await setup(page, { failSave: true });
  await expect(page.getByLabel("Operating city")).toHaveValue("bengaluru");
  await expect(page.getByLabel("Operating city").locator("option")).toHaveText([
    "Select a city",
    "Chennai",
    "Bengaluru",
  ]);
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText("Draft save failed");
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");
  expect(calls.some((c) => c.path.endsWith("/apply"))).toBe(false);
});
test("Captain submit uses real credentials and selected city; failure never reports success", async ({
  page,
}) => {
  const calls = await setup(page, { step: 3, failSubmit: true });
  await expect(
    page.getByRole("button", { name: /Approve Application/ }),
  ).toHaveCount(0);
  await page.getByLabel("Confirm application").check();
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText(
    "Application rejected by server",
  );
  expect(calls.find((c) => c.path.endsWith("/apply")).body).toMatchObject({
    area_id: "bengaluru",
    license_reference: "DL12345",
    vehicle_number: "KA01AB1234",
  });
  expect(calls.some((c) => c.path.endsWith("/online"))).toBe(false);
});
test("successful Captain submission waits for operator approval", async ({
  page,
}) => {
  const calls = await setup(page, { step: 3 });
  await page.getByLabel("Confirm application").check();
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("heading", { name: "Application submitted", exact: true })).toBeVisible();
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  expect(calls.filter((c) => c.path.endsWith("/apply"))).toHaveLength(1);
  expect(calls.some((c) => c.path.endsWith("/online"))).toBe(false);
});

test("strict step-by-step validation prevents advancing when testing mode is disabled", async ({
  page,
}) => {
  await setup(page);
  // Uncheck testing mode
  const testingToggle = page.getByLabel("Optional onboarding for testing");
  await expect(testingToggle).toBeChecked();
  await testingToggle.uncheck();
  await expect(testingToggle).not.toBeChecked();

  // Step 0: Name missing
  await page.getByLabel("Your legal name").fill("");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText("Please enter your full legal name.");
  await expect(page.getByLabel("Your legal name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");

  // Fix name, break city
  await page.getByLabel("Your legal name").fill("Real Captain");
  await page.getByLabel("Operating city").selectOption("");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText("Please select an operating city.");
  await expect(page.getByLabel("Operating city")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");

  // Fix city and advance to Step 1
  await page.getByLabel("Operating city").selectOption("bengaluru");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");

  // In Step 1, make sure testing mode remains unchecked
  if (await page.getByLabel("Optional onboarding for testing").isVisible()) {
    await page.getByLabel("Optional onboarding for testing").uncheck();
  }

  // Clear vehicle registration
  await page.getByLabel("Vehicle registration number").fill("");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText("Complete your vehicle and credential details.");
  await expect(page.getByLabel("Vehicle registration number")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");

  // Expired licence
  await page.getByLabel("Vehicle registration number").fill("KA01AB1234");
  await page.getByLabel("Licence expiry").fill("2020-01-01");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toHaveText("Driving licence expiry date must be in the future.");
  await expect(page.getByLabel("Licence expiry")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");
});

test("missing documents in Step 2 prevent advancing when testing mode is disabled", async ({
  page,
}) => {
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    let json = {};
    if (path === "/api/config")
      json = {
        areas: [{ id: "bengaluru", name: "Bengaluru", min_lat: 12, max_lat: 14, min_lng: 77, max_lng: 81 }],
        vehicles: [],
        development: true,
      };
    if (path === "/api/me") json = { user: { id: "captain" }, csrf: "test" };
    if (path === "/api/state") json = { driver: [], rides: [], offers: [] };
    if (path === "/api/profile")
      json = { details: [{ name: "Real Captain", phone: "9876543210" }] };
    if (path === "/api/drivers/onboarding") {
      json = {
        draft: { step: 2, area_id: "bengaluru", vehicle_category: "bike" },
        phone_verified: true,
        has_photo: false,
        documents: [],
      };
    }
    await r.fulfill({ json });
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");

  // Uncheck testing mode
  await page.getByLabel("Optional onboarding for testing").uncheck();
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("alert")).toContainText("Missing required documents:");
  await expect(page.locator(".upload-card.invalid-card")).toHaveCount(5);
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");
});

test("document thumbnail previews, enlarged modal, and camera option work as expected", async ({
  page,
}) => {
  await setup(page, { step: 2 });
  const thumbWrap = page.locator(".upload-thumbnail-wrap").first();
  await expect(thumbWrap).toBeVisible();
  const thumbImg = thumbWrap.locator("img.doc-thumbnail");
  await expect(thumbImg).toBeVisible();

  const cameraBtn = page.locator('[data-captain-camera="license"]');
  await expect(cameraBtn).toBeVisible();
  await expect(cameraBtn).toContainText(/Camera|Retake/);

  // Tap thumbnail to open modal
  await thumbWrap.click();
  const previewModal = page.locator(".doc-preview-modal");
  await expect(previewModal).toBeVisible();
  await expect(page.getByRole("button", { name: "Keep photo" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Retake/ })).toBeVisible();

  // Close modal via Keep photo
  await page.getByRole("button", { name: "Keep photo" }).click();
  await expect(previewModal).not.toBeVisible();
});

test("camera button shows permission alert dialog when camera access is blocked", async ({
  page,
  context,
}) => {
  await context.grantPermissions([]);
  await setup(page, { step: 2 });

  await page.evaluate(() => {
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = async () => {
        const error = new Error("Permission denied");
        error.name = "NotAllowedError";
        throw error;
      };
    }
  });

  const cameraBtn = page.locator('[data-captain-camera="license"]');
  await cameraBtn.click();

  const permModal = page.locator(".permission-modal");
  await expect(permModal).toBeVisible();
  await expect(permModal).toContainText("Camera Permission Required");
  await expect(permModal).toContainText("Camera access is needed to capture documents");

  await permModal.getByRole("button", { name: "Got it" }).click();
  await expect(permModal).not.toBeVisible();
});

test("development testing mode makes empty onboarding fields optional", async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByLabel("Optional onboarding for testing"),
  ).toBeChecked();
  await page.getByLabel("Your legal name").fill("");
  await page.getByLabel("Operating city").selectOption("");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");
  await page.getByLabel("Vehicle registration number").fill("");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");
});

test("header and bottom back buttons decrement steps (3->2->1->0->exit) without redirect trap", async ({
  page,
}) => {
  await setup(page, { step: 3 });
  await expect(page.locator(".eyebrow")).toContainText("STEP 4 OF 4");

  // Bottom back button: Step 3 -> Step 2
  const bottomBack = page.locator('[data-action="onboarding-back"]');
  await expect(bottomBack).toBeVisible();
  await bottomBack.click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");

  // Header back button: Step 2 -> Step 1
  const headerBack = page.locator('header [data-action="back"]');
  await expect(headerBack).toBeVisible();
  await headerBack.click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");

  // Bottom back button: Step 1 -> Step 0
  await page.locator('[data-action="onboarding-back"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");

  // On Step 0, bottom back button is not shown; clicking header back exits to drive
  await expect(page.locator('[data-action="onboarding-back"]')).toHaveCount(0);
  await headerBack.click();

  // Exited onboarding cleanly to drive screen
  await expect(page.locator("[data-captain-onboarding]")).toHaveCount(0);
  await expect(page.locator(".onboarding-banner")).toBeVisible();
  await expect(page.locator('[data-action="online"]')).toBeVisible();

  // Verify we are not immediately redirect-trapped back to onboarding
  await page.waitForTimeout(500);
  await expect(page.locator("[data-captain-onboarding]")).toHaveCount(0);
  await expect(page.locator(".onboarding-banner")).toBeVisible();

  // Re-opening onboarding from banner works
  await page.locator(".onboarding-banner").click();
  await expect(page.locator("[data-captain-onboarding]")).toBeVisible();
});

test("test/dev mode allows submission with no documents and unconfirmed consent", async ({
  page,
}) => {
  const calls = [];
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const path = new URL(r.request().url()).pathname;
    const body =
      r.request().method() === "POST" ? r.request().postDataJSON() : undefined;
    if (body) calls.push({ path, body });
    let json = {};
    if (path === "/api/config")
      json = {
        areas: [{ id: "bengaluru", name: "Bengaluru", min_lat: 12, max_lat: 14, min_lng: 77, max_lng: 81 }],
        vehicles: [],
        development: true,
      };
    if (path === "/api/me") json = { user: { id: "captain" }, csrf: "test" };
    if (path === "/api/state") json = { driver: [], rides: [], offers: [] };
    if (path === "/api/profile")
      json = { details: [{ name: "Test Captain", phone: "9876543210" }] };
    if (path === "/api/drivers/onboarding") {
      json = {
        draft: { step: 0, area_id: "bengaluru", vehicle_category: "bike" },
        phone_verified: true,
        has_photo: false,
        documents: [],
      };
    }
    if (path === "/api/drivers/apply") {
      json = { ok: true };
    }
    await r.fulfill({ json });
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");

  // Testing mode is enabled by default in dev mode
  await expect(page.getByLabel("Optional onboarding for testing")).toBeChecked();

  // Step 0 -> Step 1
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");

  // Step 1 -> Step 2
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");

  // Step 2 -> Step 3 (even with 0 documents)
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 4 OF 4");

  // Step 3 -> Submit for review without checking consent declaration
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.getByRole("heading", { name: "Application submitted", exact: true })).toBeVisible();

  const applyCall = calls.find((c) => c.path.endsWith("/apply"));
  expect(applyCall).toBeDefined();
  expect(applyCall.body.testing).toBe(true);
});

test("header back button steps back across onboarding steps", async ({
  page,
}) => {
  await setup(page, { step: 0 });
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");
  await page.locator('[data-action="onboarding-next"]').click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 3 OF 4");

  const headerBack = page.locator('header [data-action="back"]');
  await expect(headerBack).toBeVisible();
  await headerBack.click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 2 OF 4");

  await headerBack.click();
  await expect(page.locator(".eyebrow")).toContainText("STEP 1 OF 4");

  // Verify fake status bar and preview badge are hidden in live mode
  await expect(page.locator(".status-bar")).not.toBeVisible();
  await expect(page.locator('.app-head .badge.neutral:not([data-keep])')).not.toBeVisible();
});

test("pending Captain sees only review status until backend approval unlocks navigation", async ({ page }) => {
  let approved = false;
  await page.route("https://**", r => r.abort());
  await page.route("**/api/**", r => r.fulfill({ json: {} }));
  await page.route("**/api/me", r => r.fulfill({ json: { user: { id: "captain" }, csrf: "csrf" } }));
  await page.route("**/api/config", r => r.fulfill({ json: { areas: [], vehicles: [], development: true } }));
  await page.route("**/api/state", r => r.fulfill({ json: { rides: [], offers: [], driver: [{ status: approved ? "approved" : "pending" }] } }));
  await page.route("**/api/profile", r => r.fulfill({ json: { details: [{ name: "Captain" }] } }));
  await page.route("**/api/drivers/onboarding", r => r.fulfill({ json: { draft: { step: 3 }, documents: [], has_photo: false, phone_verified: true } }));
  await page.goto("http://127.0.0.1:5184");
  await expect(page.getByRole("heading", { name: "Application submitted", exact: true })).toBeVisible();
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Back", exact: true })).not.toBeVisible();
  await page.getByRole("button", { name: "Check approval status", exact: true }).click();
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  approved = true;
  await page.getByRole("button", { name: "Check approval status", exact: true }).click();
  await expect(page.locator(".map-art")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
  await expect(page.locator(".bottom-nav")).toContainText("Earnings");
});

for (const width of [320, 390, 768]) {
  test(`verified phone layout stays aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    await expect(page.locator('#captain-phone')).toHaveAttribute('readonly', '');
    const badge = page.locator('[data-captain-onboarding] .status-pill.success');
    await expect(badge).toBeVisible();
    const layout = await badge.evaluate(el => {
      const icon = el.querySelector('svg').getBoundingClientRect();
      const text = el.querySelector('span').getBoundingClientRect();
      return { gap: text.left - icon.right, overflow: el.scrollWidth > el.clientWidth };
    });
    expect(layout.gap).toBeGreaterThanOrEqual(0);
    expect(layout.gap).toBeLessThanOrEqual(12);
    expect(layout.overflow).toBe(false);
    if (width === 390) await page.screenshot({ path: '/tmp/hop-captain-phone-layout.png', fullPage: true });
  });
}
