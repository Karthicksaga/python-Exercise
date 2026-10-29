import { test, expect } from "@playwright/test";
async function setup(page) {
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", (r) =>
    r.fulfill({ status: 401, json: { error: "Sign in" } }),
  );
  await page.route("**/api/config", (r) =>
    r.fulfill({ json: { areas: [], vehicles: [], development: false } }),
  );
}
for (const [role, port] of [
  ["rider", 5183],
  ["captain", 5184],
]) {
  test(`${role}: login has coordinated motion and settles without layout drift`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setup(page);
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator(".login-screen")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          document
            .getAnimations()
            .filter((a) => a.id.startsWith("hop-"))
            .map((a) => a.id),
        ),
      )
      .toContain("hop-login-form");
    await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.getAnimations().filter((a) => a.id.startsWith("hop-"))
              .length,
        ),
      )
      .toBe(0);
    await expect(page.locator("#demo-phone")).toHaveValue("9876543210");
    expect(
      await page
        .locator("#app")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
  });
  test(`${role}: reduced motion disables decorative animation and keeps login usable`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator(".login-screen")).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.id.startsWith("hop-"))
            .length,
      ),
    ).toBe(0);
    await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
    await expect(
      page.getByRole("button", { name: "Send sign-in code", exact: true }),
    ).toBeEnabled();
  });
}
test("screen and modal animation stay outside the map canvas", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setup(page);
  await page.route("**/api/me", (r) =>
    r.fulfill({ json: { user: { id: "rider" }, csrf: "csrf" } }),
  );
  await page.route("**/api/state", (r) =>
    r.fulfill({ json: { rides: [], offers: [], driver: [] } }),
  );
  await page.goto("http://127.0.0.1:5183/");
  await expect(
    page.getByRole("heading", { name: "Where to next?" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".map-art")
      .evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.id.startsWith("hop-")).length,
      ),
  ).toBe(0);
  await page
    .getByRole("button", { name: "Where are you going?", exact: true })
    .click();
  await page.locator('[data-modal="stops"]').click();
  await expect
    .poll(() =>
      page
        .locator(".modal-sheet")
        .evaluate((el) => el.getAnimations().map((a) => a.id)),
    )
    .toContain("hop-modal-entry");
  await expect(page.getByLabel("Stop address")).toBeVisible();
});
