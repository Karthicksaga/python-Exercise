// Design audit (Nov 2026): checks the layout rules phone testing kept catching, on real phone sizes,
// and saves a screenshot of each screen to the test report. Run: npm run test:audit
// Rules (see .agents/skills/hop-design-review/SKILL.md): bottom nav docked flush to the bottom edge,
// no sideways scroll, tap targets at least 24 px (WCAG 2.2 AA), no critical axe accessibility issues.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setupMockBackend } from "./support/mockBackend.mjs";

const phones = [
  ["small", { width: 360, height: 760 }],
  ["large", { width: 412, height: 915 }],
];
const screens = [
  { role: "rider", port: 5183, name: "home", open: async () => {} },
  { role: "rider", port: 5183, name: "route", open: async (page) => page.getByRole("button", { name: "Where are you going?" }).click() },
  { role: "captain", port: 5184, name: "drive", open: async () => {} },
];

for (const [size, viewport] of phones)
  for (const screen of screens)
    test(`${screen.role} ${screen.name} on a ${size} phone follows the layout rules`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await setupMockBackend(page, { role: screen.role });
      await page.goto(`http://127.0.0.1:${screen.port}/`);
      await expect(page.locator("#hop-launch")).toHaveCount(0, { timeout: 15000 });
      await screen.open(page);
      await page.waitForTimeout(600);
      await info.attach(`${screen.role}-${screen.name}-${size}.png`, { body: await page.screenshot(), contentType: "image/png" });

      const layout = await page.evaluate(() => {
        const vw = innerWidth, vh = innerHeight;
        const nav = document.querySelector(".bottom-nav");
        const r = nav?.getBoundingClientRect();
        const small = [...document.querySelectorAll("#app :is(button, a[href], input, select, [role=switch])")]
          .filter((el) => {
            // Map credit links are inline text links, which WCAG 2.5.8 exempts from the size rule.
            if (el.closest(".leaflet-control-attribution, .maplibregl-ctrl-attrib")) return false;
            const b = el.getBoundingClientRect(), s = getComputedStyle(el);
            return b.width > 0 && b.height > 0 && s.visibility !== "hidden" && b.bottom > 0 && b.top < vh && (b.height < 24 || b.width < 24);
          })
          .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`);
        return {
          sideways: document.documentElement.scrollWidth > vw + 1,
          nav: r ? { bottomGap: Math.round(vh - r.bottom), left: Math.round(r.left), right: Math.round(vw - r.right) } : null,
          small,
        };
      });
      expect(layout.sideways, "page scrolls sideways").toBe(false);
      if (layout.nav) expect(layout.nav, "bottom nav must sit flush on the bottom edge, full width").toEqual({ bottomGap: 0, left: 0, right: 0 });
      expect(layout.small, "tap targets smaller than 24 px").toEqual([]);

      const axe = await new AxeBuilder({ page }).include("#app").analyze();
      const serious = axe.violations.filter((v) => v.impact === "serious");
      if (serious.length) info.annotations.push({ type: "axe serious", description: serious.map((v) => `${v.id} (${v.nodes.length})`).join(", ") });
      expect(axe.violations.filter((v) => v.impact === "critical").map((v) => `${v.id}: ${v.help}`), "critical accessibility issues").toEqual([]);
    });
