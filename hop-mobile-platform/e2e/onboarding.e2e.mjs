// A new Captain signs up through the Captain app (details, vehicle, documents, submit), waits
// in review, an operator checks every document and approves, and the Captain can then go online.
// Runs against the local API (e2e/run-local.sh) or staging (e2e/run-staging.sh).
import { test, expect, request } from "@playwright/test";

const CAPTAIN = "http://127.0.0.1:5184";
const OPERATOR_API = process.env.HOP_E2E_ADMIN_URL || "http://127.0.0.1:8081";
const OPERATOR_PHONE = process.env.HOP_E2E_OPERATOR_PHONE || "9000000001";
// A fresh number per run, so the test always starts a brand-new application.
const PHONE = process.env.HOP_E2E_NEW_CAPTAIN_PHONE || `90000${String(Date.now()).slice(-5)}`;
const REQUIRED = ["identity", "identity_back", "license", "license_back", "rc", "rc_back", "insurance"];

// The operator works through the API the admin console uses.
async function operatorSession() {
  const api = await request.newContext({ baseURL: OPERATOR_API, extraHTTPHeaders: { Origin: new URL(OPERATOR_API).origin, "X-Hop-App": "admin" } });
  const call = async (method, path, data, csrf) => {
    const res = await api.fetch(path, { method, data, headers: csrf ? { "X-CSRF-Token": csrf } : {} });
    const body = await res.json().catch(() => ({}));
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${body.error || ""}`);
    return body;
  };
  await call("POST", "/auth/otp/request", { phone: OPERATOR_PHONE });
  const verified = await call("POST", "/auth/otp/verify", { phone: OPERATOR_PHONE, code: "123456" });
  const me = await call("GET", "/api/me");
  if (me.user?.role !== "operator")
    throw new Error(`${OPERATOR_PHONE} is not an operator; promote it once (see e2e/README.md)`);
  const csrf = me.csrf || verified.csrf;
  return { call: (method, path, data) => call(method, path, data, csrf), dispose: () => api.dispose() };
}

// A plain document-like test image, drawn in the page so no binary fixtures are stored.
async function testImage(page, label) {
  const base64 = await page.evaluate((text) => {
    const c = document.createElement("canvas");
    c.width = 640; c.height = 400;
    const g = c.getContext("2d");
    g.fillStyle = "#f4f4f9"; g.fillRect(0, 0, 640, 400);
    g.fillStyle = "#14151f"; g.font = "bold 36px sans-serif"; g.fillText(text, 40, 210);
    return c.toDataURL("image/png").split(",")[1];
  }, `HOP E2E TEST · ${label}`);
  return { name: `${label}.png`, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

test("a new captain onboards in the app, an operator approves every document, and the captain can drive", async ({ browser }) => {
  const ctx = await browser.newContext({ geolocation: { latitude: 13.0067, longitude: 80.2206 }, permissions: ["geolocation"] });
  const page = await ctx.newPage();
  const next = () => page.locator('[data-action="onboarding-next"]').click();
  const step = (n) => expect(page.locator(".eyebrow")).toContainText(`STEP ${n} OF 4`, { timeout: 15000 });

  await page.goto(CAPTAIN);
  await page.locator("#demo-phone").fill(PHONE);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  await page.getByLabel("Six-digit SMS code").fill("123456");
  await page.getByRole("button", { name: "Verify & continue", exact: true }).click();

  // Onboarding is mandatory: no map or navigation before approval.
  await step(1);
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  const testing = page.getByLabel("Optional onboarding for testing");
  if (await testing.isVisible().catch(() => false)) await testing.uncheck(); // the real checks, not the shortcut

  // 1. Who and where.
  await page.getByLabel("Your legal name").fill("E2E Test Captain");
  const city = page.getByLabel("Operating city");
  const chennai = await city.locator("option", { hasText: "Chennai" }).first().getAttribute("value");
  await city.selectOption(chennai);
  await page.locator("#captain-upload-portrait").setInputFiles(await testImage(page, "portrait"));
  await expect(page.locator('[data-upload-kind="portrait"]')).toHaveClass(/uploaded/, { timeout: 20000 });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await next();

  // 2. Vehicle and credentials.
  await step(2);
  await page.locator('[data-captain-vehicle="auto"]').click();
  await expect(page.locator('[data-captain-vehicle="auto"]')).toHaveAttribute("aria-checked", "true");
  const year = new Date().getFullYear() + 3;
  for (const [label, value] of [
    ["Vehicle registration number", "TN09ZZ" + PHONE.slice(-4)],
    ["Vehicle make", "Bajaj"],
    ["Vehicle model", "RE Compact"],
    ["Vehicle colour", "Yellow"],
    ["Driving licence number", "TN-0920261234567"],
    ["Licence expiry", `${year}-06-30`],
    ["Insurance policy number", "POL-E2E-" + PHONE.slice(-4)],
    ["Insurance expiry", `${year}-03-31`],
    ["UPI ID (optional)", "e2e.captain@okhop"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await next();

  // 3. Documents: every required file is uploaded to the server, not just previewed.
  await step(3);
  for (const kind of REQUIRED) {
    await page.locator(`#captain-upload-${kind}`).setInputFiles(await testImage(page, kind));
    await expect(page.locator(`[data-upload-kind="${kind}"]`)).toContainText("In review", { timeout: 20000 });
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
  await next();

  // 4. Confirm and submit; the captain waits for review with nothing unlocked.
  await step(4);
  await page.getByLabel("Confirm application").check();
  await next();
  await expect(page.getByRole("heading", { name: "Application submitted", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".map-art, .bottom-nav")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Go online" })).toHaveCount(0);

  // 5. The operator finds the application, claims it and accepts each document.
  const operator = await operatorSession();
  try {
    const queue = await operator.call("GET", `/api/admin/drivers?status=pending&q=${PHONE.slice(-4)}`);
    const app = (queue.drivers || queue.items || queue).find?.((d) => (d.vehicle_number || "").endsWith(PHONE.slice(-4)));
    expect(app, "application in the operator review queue").toBeTruthy();
    const id = app.user_id || app.id;
    expect(app.documents || app.document_kinds || REQUIRED).toEqual(expect.arrayContaining(REQUIRED));
    await operator.call("POST", `/api/admin/drivers/${id}/claim`, {});
    await operator.call("POST", `/api/admin/drivers/${id}`, {
      documents: Object.fromEntries(REQUIRED.map((kind) => [kind, { status: "accepted" }])),
      identity_ok: true, license_ok: true, rc_ok: true, insurance_ok: true, vehicle_ok: true, police_ok: true,
      police_reference: "PCC-E2E-" + PHONE.slice(-4), status: "approved", note: "End-to-end test approval",
    });
  } finally {
    await operator.dispose();
  }

  // 6. Approval reaches the app: driving unlocks and going online works.
  await page.getByRole("button", { name: "Check approval status" }).click().catch(() => {});
  await expect(page.getByRole("button", { name: "Go online" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Go online" }).click();
  await expect.poll(async () => (await (await ctx.request.get(`${CAPTAIN}/api/state`)).json()).driver?.[0]?.online, { timeout: 20000 }).toBe(true);
  const me = await (await ctx.request.get(`${CAPTAIN}/api/me`)).json();
  expect(me.user.name).not.toMatch(/^Rider /);
  // Leave the test captain offline so it never receives real requests.
  await page.getByRole("button", { name: /^Online$|Go offline/ }).first().click().catch(() => {});
  await ctx.close();
});
