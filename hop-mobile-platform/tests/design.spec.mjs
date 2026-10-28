import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdirSync } from "node:fs";
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
async function readyFonts(page) {
  await page.evaluate(async () => {
    const sample =
      "₹0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    await Promise.all(
      ["Inter", "Outfit"].flatMap((family) =>
        [400, 500, 600, 650, 700, 750, 800].map((weight) =>
          document.fonts.load(`${weight} 16px "${family}"`, sample),
        ),
      ),
    );
    await document.fonts.ready;
    document.querySelectorAll("#app button").forEach((el) => {
      el.getBoundingClientRect();
      getComputedStyle(el).borderRadius;
    });
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
}
async function stableShot(locator, options) {
  let previous = await locator.screenshot(options);
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await locator.screenshot(options);
    if (next.equals(previous)) return next;
    previous = next;
  }
  throw new Error("Screen paint did not settle for exact visual comparison.");
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
    // Match the standalone DOM ancestry too: ancestor clipping can otherwise
    // produce one-channel antialias noise at rounded card edges.
    await reference.evaluate(() => {
      document.body.append(document.querySelector("#phone"));
      document.querySelector(".review-shell").style.display = "none";
    });
    if (role === "captain")
      await reference
        .locator('[data-role="captain"]')
        .evaluate((el) => el.click());
    await app.goto(urls[role] + "/?map=reference");
    await expect(app.locator("#app")).toHaveClass(new RegExp(role));
    const screens = await reference
      .locator("#screen-select option")
      .evaluateAll((options) => options.map((o) => o.value));
    for (const screen of screens) {
      await choose(reference, screen);
      await choose(app, screen);
      await Promise.all([readyFonts(reference), readyFonts(app)]);
      const cardStyles = (page) =>
        page
          .locator(".sheet,.product-chip,.usual-ride")
          .evaluateAll((elements) =>
            elements.map((el) => {
              const css = getComputedStyle(el),
                r = el.getBoundingClientRect();
              return {
                className: el.className,
                x: r.x,
                y: r.y,
                width: r.width,
                height: r.height,
                background: css.backgroundColor,
                border: css.borderColor,
                shadow: css.boxShadow,
                radius: css.borderRadius,
                transform: css.transform,
                opacity: css.opacity,
                filter: css.filter,
              };
            }),
          );
      expect(
        await cardStyles(app),
        `${role}/${screen}: computed card styles`,
      ).toEqual(await cardStyles(reference));
      mkdirSync(test.info().outputDir, { recursive: true });
      const expected = PNG.sync.read(
        await stableShot(reference.locator("#app"), {
          animations: "disabled",
          path: test.info().outputPath(`reference-${role}-${screen}.png`),
        }),
      );
      const actual = PNG.sync.read(
        await stableShot(app.locator("#app"), {
          animations: "disabled",
          path: test.info().outputPath(`${role}-${screen}.png`),
        }),
      );
      expect(actual.width, screen).toBe(expected.width);
      expect(actual.height, screen).toBe(expected.height);
      let differing = 0;
      for (let i = 0; i < actual.data.length; i += 4) {
        if (
          // Chromium can round a composited edge by one channel value even
          // with identical computed styles and geometry (asserted above).
          Math.abs(actual.data[i] - expected.data[i]) > 1 ||
          Math.abs(actual.data[i + 1] - expected.data[i + 1]) > 1 ||
          Math.abs(actual.data[i + 2] - expected.data[i + 2]) > 1
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
    await page.goto(urls[role] + "/?map=reference");
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
