import { test, expect } from "@playwright/test";
for (const [role, port] of [
  ["rider", 5183],
  ["captain", 5184],
]) {
  async function setup(page, session) {
    await page.route("https://**", (r) => r.abort());
    await page.route("**/api/**", (r) =>
      r.fulfill({ status: 401, json: { error: "Sign in" } }),
    );
    await page.route("**/api/config", (r) =>
      r.fulfill({ json: { areas: [], vehicles: [], development: false } }),
    );
    await page.route("**/api/me", session);
  }
  test(`${role}: signed-out launch opens approved login without sending SMS`, async ({
    page,
  }) => {
    let sms = 0;
    await setup(page, (r) =>
      r.fulfill({ status: 401, json: { error: "Sign in" } }),
    );
    await page.route("**/auth/otp/request", (r) => {
      sms++;
      return r.fulfill({ json: { ok: true } });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator('#app[data-ready="true"]')).toBeVisible();
    await expect(page.locator(".login-screen")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send sign-in code", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".home-sheet, .earnings-mini")).toHaveCount(0);
    expect(sms).toBe(0);
  });
  test(`${role}: valid saved session bypasses login`, async ({ page }) => {
    await setup(page, (r) =>
      r.fulfill({ json: { user: { id: "account" }, csrf: "csrf" } }),
    );
    await page.route("**/api/state", (r) =>
      r.fulfill({ json: { rides: [], offers: [], driver: [] } }),
    );
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator('#app[data-ready="true"]')).toBeVisible();
    await expect(page.locator(".login-screen")).toHaveCount(0);
    await expect(
      page.locator(role === "rider" ? ".home-sheet" : ".earnings-mini"),
    ).toBeVisible();
  });
  test(`${role}: launch stays gated during session check and handles unavailable backend`, async ({
    page,
  }) => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await setup(page, async (r) => {
      await gate;
      await r.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator("#app")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#app")).not.toBeVisible();
    release();
    await expect(page.locator(".login-screen")).toBeVisible();
    await expect(page.locator(".login-feedback")).toContainText(
      "could not check your saved session",
    );
    await expect(page.locator(".home-sheet, .earnings-mini")).toHaveCount(0);
  });
}
