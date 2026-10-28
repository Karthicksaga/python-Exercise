import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
const urls = {
  rider: "http://127.0.0.1:5183",
  captain: "http://127.0.0.1:5184",
};
const referenceURL = process.env.HOP_PROTOTYPE_URL || "http://127.0.0.1:5290";
async function choose(page, screen) {
  await page.locator("#screen-select").evaluate((el, value) => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, screen);
}
for (const role of ["rider", "captain"]) {
  test(`${role}: all screens match the canonical prototype pixels`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    // Freeze external font availability consistently; the canonical CSS still
    // supplies identical font stacks, sizes, weights and tokens to both apps.
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
      route.abort(),
    );
    const reference = await context.newPage(),
      app = await context.newPage();
    await reference.setViewportSize({ width: 390, height: 811 });
    await app.setViewportSize({ width: 390, height: 811 });
    const errors = [],
      mutations = [];
    app.on("pageerror", (e) => errors.push(e.message));
    app.on("request", (r) => {
      if (/\/api\/|\/auth\//.test(r.url())) mutations.push(r.url());
    });
    await reference.goto(referenceURL);
    // Remove only the lab’s surrounding review frame, exactly as the mobile
    // wrapper does. Matching origins avoids SVG subpixel rasterization drift.
    await reference.addStyleTag({
      content: `
      .review-left,.review-right,.mobile-review,.stage-caption{display:none!important}
      html,body{height:100%;overflow:hidden}body{display:grid;place-items:center}
      .review-shell,.stage{display:block;padding:0;margin:0;width:100%;height:100dvh;min-height:0}
      #phone.phone{width:100%;max-width:500px;height:100dvh;min-height:0;border:0;border-radius:0;box-shadow:none}
    `,
    });
    if (role === "captain")
      await reference
        .locator('[data-role="captain"]')
        .evaluate((el) => el.click());
    await app.goto(urls[role]+"/?map=reference");
    await expect(app.locator("#app")).toHaveClass(new RegExp(role));
    const screens = await reference
      .locator("#screen-select option")
      .evaluateAll((options) => options.map((o) => o.value));
    for (const screen of screens) {
      await choose(reference, screen);
      await choose(app, screen);
      await Promise.all([
        reference.evaluate(() => document.fonts.ready),
        app.evaluate(() => document.fonts.ready),
      ]);
      const expected = PNG.sync.read(
        await reference
          .locator("#app")
          .screenshot({
            animations: "disabled",
            path: `/private/tmp/hop-mobile-replica-results/reference-${role}-${screen}.png`,
          }),
      );
      const actual = PNG.sync.read(
        await app
          .locator("#app")
          .screenshot({
            animations: "disabled",
            path: `/private/tmp/hop-mobile-replica-results/${role}-${screen}.png`,
          }),
      );
      expect(actual.width, screen).toBe(expected.width);
      expect(actual.height, screen).toBe(expected.height);
      let differing = 0;
      for (let i = 0; i < actual.data.length; i += 4) {
        if (
          actual.data[i] !== expected.data[i] ||
          actual.data[i + 1] !== expected.data[i + 1] ||
          actual.data[i + 2] !== expected.data[i + 2]
        )
          differing++;
      }
      expect(differing, `${role}/${screen}: differing pixels`).toBe(0);
    }
    expect(errors).toEqual([]);
    expect(mutations).toEqual([]);
    await context.close();
  });
  test(`${role}: short phones keep the approved anchored layout and hide review controls`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(urls[role]+"/?map=reference");
    await expect(page.locator("[data-prototype-review]")).toBeHidden();
    await expect(page.locator(".app-head")).toBeVisible();
    const screens = await page
      .locator("#screen-select option")
      .evaluateAll((options) => options.map((o) => o.value));
    for (const screen of screens) {
      await choose(page, screen);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        screen,
      ).toBe(true);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        screen,
      ).toBe(true);
      const footer = page.locator(".action-bar");
      if (await footer.count()) {
        const rect = await footer.boundingBox();
        expect(rect.y + rect.height, screen).toBeLessThanOrEqual(640);
      }
    }
  });
}
