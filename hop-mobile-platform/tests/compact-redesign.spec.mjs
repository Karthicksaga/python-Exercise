// Compact redesign (Nov 2026): slide to accept / complete, the header online switch, the early-finish
// question and the cash change helper.
import { test, expect } from "@playwright/test";

const ride = {
  id: "slide-ride",
  version: 3,
  pickup_lat: 13.0067,
  pickup_lng: 80.2206,
  dropoff_lat: 12.99,
  dropoff_lng: 80.17,
  pickup_label: "Adyar",
  dropoff_label: "Airport",
  vehicle_category: "auto",
  payment_method: "cash",
  fare_paise: 26800,
  payable_paise: 26800,
};

async function setup(page, state) {
  await page.route("https://**", (r) => r.abort());
  await page.route(/^http:\/\/127\.0\.0\.1:518[34]\/api\//, (r) => r.fulfill({ json: {} }));
  await page.route("**/api/me", (r) => r.fulfill({ json: { user: { id: "captain" }, csrf: "csrf" } }));
  await page.route("**/api/config", (r) => r.fulfill({ json: { areas: [], vehicles: [], development: true } }));
  await page.route("**/api/state", (r) => r.fulfill({ json: state() }));
}

async function slide(page, name) {
  const knob = page.getByRole("button", { name, exact: true });
  const track = page.locator(".hop-slide").filter({ has: knob });
  const k = await knob.boundingBox(), t = await track.boundingBox();
  await page.mouse.move(k.x + k.width / 2, k.y + k.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width - 8, k.y + k.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("captain accepts by sliding; a plain tap does nothing", async ({ page }) => {
  const actions = [];
  await setup(page, () => ({ rides: [], offers: [{ ...ride, status: "requested" }], driver: [{ online: true, status: "approved" }] }));
  await page.route("**/api/rides/slide-ride/actions", (r) => {
    actions.push(r.request().postDataJSON());
    return r.fulfill({ json: { ok: true } });
  });
  await page.goto("http://127.0.0.1:5184");
  const knob = page.getByRole("button", { name: "Accept ride", exact: true });
  await expect(knob).toBeVisible();
  await expect(page.locator(".hop-slide-text")).toHaveText("Slide to accept");
  await knob.click();
  await page.waitForTimeout(400);
  expect(actions).toEqual([]);
  await slide(page, "Accept ride");
  await expect.poll(() => actions.length).toBe(1);
  expect(actions[0]).toMatchObject({ action: "accept", version: 3 });
});

test("completing far from the drop-off asks first and sends confirm only after yes", async ({ page }) => {
  const actions = [];
  let asked = "";
  await setup(page, () => ({ rides: [{ ...ride, status: "in_progress", driving: true, mine: false }], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.route("**/api/rides/slide-ride/actions", (r) => {
    const body = r.request().postDataJSON();
    actions.push(body);
    if (!body.confirm)
      return r.fulfill({ status: 409, json: { error: "Early finish: you are about 3.0 km from the destination. The fare becomes ₹25 for the distance covered unless the rider approves the full fare." } });
    return r.fulfill({ json: { ok: true } });
  });
  page.on("dialog", (dialog) => {
    asked = dialog.message();
    void dialog.accept();
  });
  await page.goto("http://127.0.0.1:5184");
  await expect(page.locator(".hop-slide-text")).toHaveText("Slide to complete trip");
  await slide(page, "Complete trip");
  await expect.poll(() => actions.length).toBe(2);
  expect(asked).toContain("Early finish");
  expect(actions[0]).toMatchObject({ action: "complete" });
  expect(actions[0].confirm).toBeUndefined();
  expect(actions[1]).toMatchObject({ action: "complete", confirm: true });
});

test("an approved captain's online control is a header switch", async ({ page }) => {
  await setup(page, () => ({ rides: [], offers: [], driver: [{ online: true, status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  const toggle = page.locator('.app-head [data-action="online"]');
  await expect(toggle).toHaveText("Online");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".action-bar [data-action='online']")).toHaveCount(0);
});

test("captain cash screen shows the change to give back", async ({ page }) => {
  await setup(page, () => ({ rides: [{ ...ride, status: "completed", driving: true, mine: true, payment_status: "unconfirmed" }], offers: [], driver: [{ status: "approved" }] }));
  await page.goto("http://127.0.0.1:5184");
  await page.getByRole("button", { name: "Trips", exact: true }).click();
  await page.getByRole("tab", { name: "Past", exact: true }).click();
  await page.getByRole("button", { name: "Payment & receipt", exact: false }).click();
  await expect(page.locator(".cash-change-result")).toHaveText("Tap what the rider gave");
  await page.getByRole("radio", { name: "₹500" }).click();
  await expect(page.locator(".cash-change-result")).toContainText("Give back");
  await expect(page.locator(".cash-change-result")).toContainText("232.00");
  await page.getByRole("radio", { name: "Exact" }).click();
  await expect(page.locator(".cash-change-result")).toContainText("No change");
});
