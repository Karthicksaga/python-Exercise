import { test, expect } from "@playwright/test";

for (const [role, port] of [["rider", 5183], ["captain", 5184]]) {
  test(`${role}: keyboard viewport keeps the focused field reachable and restores shell`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.route("https://**", route => route.abort());
    await page.route("**/api/**", route => route.fulfill({ status: 401, json: { error: "Sign in" } }));
    await page.route("**/api/config", route => route.fulfill({ json: { areas: [], vehicles: [], development: false } }));
    await page.goto(`http://127.0.0.1:${port}/`);
    const input = page.getByLabel("Mobile number", { exact: true });
    await input.fill("9876543210");
    // Desktop Chromium has no software keyboard: simulate its visual viewport event.
    await page.evaluate(() => {
      Object.defineProperty(visualViewport, "height", { configurable: true, value: 340 });
      visualViewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.locator("#phone").evaluate(el => el.clientHeight)).toBe(340);
    await expect.poll(() => input.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= 340;
    })).toBe(true);
    await expect(input).toHaveValue("9876543210");
    await page.evaluate(() => {
      delete visualViewport.height;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    await expect.poll(() => page.locator("#phone").evaluate(el => el.clientHeight)).toBe(640);
    expect(await page.locator("#app").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}
