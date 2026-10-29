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
