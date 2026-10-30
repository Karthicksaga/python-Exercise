import { test, expect } from "@playwright/test";
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";

const VIEWPORTS = [
  { id: "320x640", name: "small-phone", width: 320, height: 640 },
  { id: "390x844", name: "standard-phone", width: 390, height: 844 },
  { id: "768x1024", name: "tablet", width: 768, height: 1024 },
  { id: "1280x800", name: "desktop", width: 1280, height: 800 },
];

const RIDER_SCREENS = [
  "auth",
  "home",
  "activity",
  "wallet",
  "account",
  "personal",
  "saved",
  "preferences",
  "safety",
  "support",
  "notifications",
];

const RIDER_MODALS = ["sos", "share", "contacts", "report"];

const CAPTAIN_SCREENS = [
  "drive",
  "earnings",
  "activity",
  "account",
  "vehicle",
  "safety",
];

const SCREENS_DIR = path.resolve("test-results/screens");
mkdirSync(SCREENS_DIR, { recursive: true });

async function readyFonts(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll("#app button").forEach((el) => {
      el.getBoundingClientRect();
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function auditLayout(page, { role, screen, vp, mode }) {
  const findings = [];

  // 1. Horizontal overflow assertion
  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const bodyWidth = document.body.scrollWidth;
    return {
      docWidth,
      winWidth,
      bodyWidth,
      hasOverflow: docWidth > winWidth || bodyWidth > winWidth,
    };
  });
  if (overflow.hasOverflow) {
    findings.push(`Horizontal overflow on ${role}/${screen}/${vp.id}: docWidth=${overflow.docWidth}px, bodyWidth=${overflow.bodyWidth}px, winWidth=${overflow.winWidth}px`);
  }

  // 2. Container centering and width constraints on tablet/desktop
  const phoneBox = await page.locator("#phone").boundingBox();
  if (!phoneBox) {
    findings.push(`Missing #phone element on ${role}/${screen}/${vp.id}`);
  } else {
    if (vp.width >= 768) {
      if (phoneBox.width > 502) {
        findings.push(`Container too wide on ${vp.id}: width=${phoneBox.width}px (expected <= 500px)`);
      }
      const leftMargin = phoneBox.x;
      const rightMargin = vp.width - (phoneBox.x + phoneBox.width);
      if (Math.abs(leftMargin - rightMargin) > 3) {
        findings.push(`Container uncentered on ${vp.id}: left=${leftMargin.toFixed(1)}px, right=${rightMargin.toFixed(1)}px`);
      }
    } else {
      if (Math.abs(phoneBox.width - vp.width) > 3) {
        findings.push(`Container width mismatch on ${vp.id}: width=${phoneBox.width}px != expected ${vp.width}px`);
      }
    }
  }

  // 3. Zero-height critical elements
  const critical = await page.evaluate(() => {
    const zeroList = [];
    const headings = Array.from(document.querySelectorAll("#app h1, #app h2, #app h3"));
    for (const h of headings) {
      const r = h.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        zeroList.push(`Zero-dimension heading: "${h.textContent.trim().slice(0, 30)}"`);
      }
    }
    const header = document.querySelector("#app .app-head");
    if (header && header.getBoundingClientRect().height === 0) {
      zeroList.push("Zero-height .app-head");
    }
    const body = document.querySelector("#app .screen-body");
    if (body && body.getBoundingClientRect().height === 0) {
      zeroList.push("Zero-height .screen-body");
    }
    return zeroList;
  });
  findings.push(...critical);

  // 4. Interactive touch target sizes
  const buttonAudit = await page.evaluate(() => {
    const items = [];
    const buttons = Array.from(document.querySelectorAll("#app button:not([hidden])"));
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const isIcon = b.classList.contains("icon-button") || !!b.querySelector("svg") || b.classList.contains("pickup-inline");
      const minDim = Math.min(r.width, r.height);
      const minAllowed = isIcon ? 36 : 40;
      if (minDim < minAllowed) {
        const text = (b.textContent.trim() || b.getAttribute("aria-label") || b.className).slice(0, 25);
        items.push({ text, width: Math.round(r.width), height: Math.round(r.height) });
      }
    }
    return items;
  });

  return { findings, buttonAudit, overflow, phoneBox };
}

async function setupMockBackend(page, { role = "rider", driverApproved = true, onboardingDraft = null } = {}) {
  await page.route("https://**", (r) => r.abort());
  await page.route("**/api/**", async (r) => {
    const req = r.request();
    const p = new URL(req.url()).pathname;
    const body = req.method() === "POST" ? req.postDataJSON() : null;

    if (p === "/api/config") {
      return r.fulfill({
        json: {
          areas: [
            { id: "chennai", name: "Chennai", min_lat: 12.8, max_lat: 13.3, min_lng: 80, max_lng: 80.5 },
            { id: "bengaluru", name: "Bengaluru", min_lat: 12.8, max_lat: 13.2, min_lng: 77.4, max_lng: 77.8 },
          ],
          vehicles: [
            { area_id: "chennai", category: "auto", name: "Auto" },
            { area_id: "chennai", category: "bike", name: "Bike" },
            { area_id: "chennai", category: "sedan", name: "Sedan" },
          ],
          development: true,
        },
      });
    }
    if (p === "/api/me") {
      return r.fulfill({
        json: { user: { id: role === "captain" ? "captain-1" : "rider-1" }, csrf: "csrf-token" },
      });
    }
    if (p === "/api/state") {
      return r.fulfill({
        json: {
          rides: [],
          offers: [],
          driver: role === "captain" ? [{ status: driverApproved ? "approved" : "onboarding" }] : [],
        },
      });
    }
    if (p === "/api/profile") {
      return r.fulfill({
        json: {
          details: [{
            name: role === "captain" ? "Arun Captain" : "Deepa Rider",
            phone: "9876543210",
            phone_verified: true,
            email: "deepa@example.com",
            gender: "female",
            birth_date: "1995-05-15",
            default_payment: "cash",
            default_vehicle: "auto",
          }],
          contacts: [{ name: "Anand R", mobile: "9876543211", relationship: "Family" }],
        },
      });
    }
    if (p === "/api/companion") {
      return r.fulfill({
        json: {
          scheduled_rides: [],
          family: [],
          preferences: { language: "en", notifications_enabled: true },
        },
      });
    }
    if (p === "/api/wallet") {
      return r.fulfill({
        json: {
          balance: 650,
          transactions: [
            { title: "Added to wallet", amount: 500, type: "credit", date: "Today" },
            { title: "Ride payment", amount: -268, type: "debit", date: "Yesterday" },
          ],
        },
      });
    }
    if (p === "/api/notifications") {
      return r.fulfill({
        json: {
          notifications: [
            { id: "1", title: "Trip confirmed", body: "Your ride with Arun is scheduled.", read: false },
          ],
        },
      });
    }
    if (p === "/api/drivers/onboarding") {
      return r.fulfill({
        json: {
          draft: onboardingDraft || {
            step: 0,
            area_id: "chennai",
            vehicle_category: "bike",
            vehicle_number: "TN 09 AB 1234",
            vehicle_make: "Honda",
            vehicle_model: "Activa",
            vehicle_color: "Black",
          },
          phone_verified: true,
          has_photo: true,
          documents: ["license", "rc", "insurance", "identity"].map((kind) => ({ kind })),
        },
      });
    }
    return r.fulfill({ json: {} });
  });
}

async function saveScreenShots(page, { role, screen, vp, mode = "live" }) {
  // Primary standard name: {role}-{screen}-{viewport}.png
  const primaryFile = `${role}-${screen}-${vp.id}.png`;
  const primaryPath = path.join(SCREENS_DIR, primaryFile);
  await page.screenshot({ path: primaryPath });

  // Mode-tagged name: {role}-{mode}-{screen}-{viewport}.png
  const modeFile = `${role}-${mode}-${screen}-${vp.id}.png`;
  const modePath = path.join(SCREENS_DIR, modeFile);
  copyFileSync(primaryPath, modePath);
}

// ============================================================================
// REFERENCE MODE TEST SUITE
// ============================================================================
test.describe("Reference Mode Screens Visual & Responsive Audit", () => {
  for (const vp of VIEWPORTS) {
    test(`Rider reference screens [${vp.name} ${vp.id}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://127.0.0.1:5183/?map=reference");
      await expect(page.locator("#app")).toHaveClass(/rider/);
      await expect(page.locator("#screen-select option")).not.toHaveCount(0);
      await page.waitForLoadState("domcontentloaded");

      const choose = async (s) => {
        await page.locator("#screen-select").evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, s);
      };

      const auditErrors = [];

      for (const screen of RIDER_SCREENS) {
        await choose(screen);
        await readyFonts(page);

        await saveScreenShots(page, { role: "rider", screen, vp, mode: "reference" });

        const audit = await auditLayout(page, { role: "rider", screen, vp, mode: "reference" });
        if (audit.findings.length) {
          auditErrors.push({ screen, findings: audit.findings });
        }
      }

      // Modals
      for (const modal of RIDER_MODALS) {
        await page.evaluate((m) => {
          const btn = document.createElement("button");
          btn.dataset.modal = m;
          document.body.appendChild(btn);
          btn.click();
          btn.remove();
        }, modal);

        await expect(page.locator(".modal-sheet")).toBeVisible();
        await readyFonts(page);

        await saveScreenShots(page, { role: "rider", screen: modal, vp, mode: "reference" });
        // Also save modal- prefixed alias
        copyFileSync(
          path.join(SCREENS_DIR, `rider-${modal}-${vp.id}.png`),
          path.join(SCREENS_DIR, `rider-modal-${modal}-${vp.id}.png`),
        );

        const audit = await auditLayout(page, { role: "rider", screen: `modal-${modal}`, vp, mode: "reference" });
        if (audit.findings.length) {
          auditErrors.push({ screen: `modal-${modal}`, findings: audit.findings });
        }

        await page.evaluate(() => {
          document.querySelector('[data-action="close-modal"]')?.click();
        });
        await expect(page.locator(".modal-sheet")).toHaveCount(0);
      }

      expect(auditErrors, `Layout issues in Rider Reference [${vp.id}]`).toEqual([]);
    });

    test(`Captain reference screens [${vp.name} ${vp.id}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://127.0.0.1:5184/?map=reference");
      await expect(page.locator("#app")).toHaveClass(/captain/);
      await expect(page.locator("#screen-select option")).not.toHaveCount(0);
      await page.waitForLoadState("domcontentloaded");

      const choose = async (s) => {
        await page.locator("#screen-select").evaluate((el, val) => {
          el.value = val;
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }, s);
      };

      const auditErrors = [];

      for (const screen of CAPTAIN_SCREENS) {
        await choose(screen);
        await readyFonts(page);

        await saveScreenShots(page, { role: "captain", screen, vp, mode: "reference" });

        const audit = await auditLayout(page, { role: "captain", screen, vp, mode: "reference" });
        if (audit.findings.length) {
          auditErrors.push({ screen, findings: audit.findings });
        }
      }

      // Onboarding steps 0, 1, 2, 3
      for (let step = 0; step < 4; step++) {
        await page.evaluate((targetStep) => {
          const select = document.querySelector("#screen-select");
          if (select) {
            select.value = "onboarding";
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
          const getStep = () => Math.max(0, document.querySelectorAll('.onboarding-steps span.active').length - 1);
          let cur = getStep();
          while (cur > targetStep) {
            const btn = document.querySelector('button[data-action="onboarding-back"]');
            if (btn) btn.click();
            else break;
            cur = getStep();
          }
          while (cur < targetStep) {
            const btn = document.querySelector('button[data-action="onboarding-next"]');
            if (btn) btn.click();
            else break;
            cur = getStep();
          }
        }, step);

        await readyFonts(page);

        await saveScreenShots(page, { role: "captain", screen: `onboarding-step${step}`, vp, mode: "reference" });
        // Also save numeric alias: captain-onboarding-${step}-${vp.id}.png
        copyFileSync(
          path.join(SCREENS_DIR, `captain-onboarding-step${step}-${vp.id}.png`),
          path.join(SCREENS_DIR, `captain-onboarding-${step}-${vp.id}.png`),
        );

        const audit = await auditLayout(page, { role: "captain", screen: `onboarding-step${step}`, vp, mode: "reference" });
        if (audit.findings.length) {
          auditErrors.push({ screen: `onboarding-step${step}`, findings: audit.findings });
        }
      }

      expect(auditErrors, `Layout issues in Captain Reference [${vp.id}]`).toEqual([]);
    });
  }
});

// ============================================================================
// LIVE MODE TEST SUITE
// ============================================================================
test.describe("Live Mode Screens Visual & Responsive Audit", () => {
  for (const vp of VIEWPORTS) {
    test(`Rider live screens [${vp.name} ${vp.id}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Unauthenticated launch captures Live Auth
      await page.route("**/api/me", (r) => r.fulfill({ status: 401, json: { error: "Unauthorized" } }));
      await page.goto("http://127.0.0.1:5183");
      await expect(page.locator("#app[data-ready=true]")).toBeVisible();
      await readyFonts(page);
      await saveScreenShots(page, { role: "rider", screen: "auth", vp, mode: "live" });

      // 2. Authenticated live journey
      await setupMockBackend(page, { role: "rider" });
      await page.goto("http://127.0.0.1:5183");
      await expect(page.locator("#app[data-ready=true]")).toBeVisible();
      await readyFonts(page);

      const navTo = async (target) => {
        await page.evaluate((s) => {
          const btn = document.createElement("button");
          btn.dataset.go = s;
          document.body.appendChild(btn);
          btn.click();
          btn.remove();
        }, target);
        await readyFonts(page);
      };

      const auditErrors = [];

      // Rider screens in live mode
      for (const screen of RIDER_SCREENS) {
        if (screen === "auth") continue; // Already audited above
        await navTo(screen);
        await saveScreenShots(page, { role: "rider", screen, vp, mode: "live" });

        const audit = await auditLayout(page, { role: "rider", screen, vp, mode: "live" });
        if (audit.findings.length) {
          auditErrors.push({ screen, findings: audit.findings });
        }
      }

      // Modals in live mode
      for (const modal of RIDER_MODALS) {
        await page.evaluate((m) => {
          const btn = document.createElement("button");
          btn.dataset.modal = m;
          document.body.appendChild(btn);
          btn.click();
          btn.remove();
        }, modal);

        await expect(page.locator(".modal-sheet")).toBeVisible();
        await readyFonts(page);

        await saveScreenShots(page, { role: "rider", screen: modal, vp, mode: "live" });
        copyFileSync(
          path.join(SCREENS_DIR, `rider-${modal}-${vp.id}.png`),
          path.join(SCREENS_DIR, `rider-modal-${modal}-${vp.id}.png`),
        );

        const audit = await auditLayout(page, { role: "rider", screen: `modal-${modal}`, vp, mode: "live" });
        if (audit.findings.length) {
          auditErrors.push({ screen: `modal-${modal}`, findings: audit.findings });
        }

        await page.evaluate(() => {
          document.querySelector('[data-action="close-modal"]')?.click();
        });
        await expect(page.locator(".modal-sheet")).toHaveCount(0);
      }

      expect(auditErrors, `Layout issues in Rider Live [${vp.id}]`).toEqual([]);
    });

    test(`Captain live screens [${vp.name} ${vp.id}]`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });

      // 1. Authenticated Captain drive & operational screens
      await setupMockBackend(page, { role: "captain", driverApproved: true });
      await page.goto("http://127.0.0.1:5184");
      await expect(page.locator("#app[data-ready=true]")).toBeVisible();
      await readyFonts(page);

      const navTo = async (target) => {
        await page.evaluate((s) => {
          const btn = document.createElement("button");
          btn.dataset.go = s;
          document.body.appendChild(btn);
          btn.click();
          btn.remove();
        }, target);
        await readyFonts(page);
      };

      const auditErrors = [];

      for (const screen of CAPTAIN_SCREENS) {
        await navTo(screen);
        await saveScreenShots(page, { role: "captain", screen, vp, mode: "live" });

        const audit = await auditLayout(page, { role: "captain", screen, vp, mode: "live" });
        if (audit.findings.length) {
          auditErrors.push({ screen, findings: audit.findings });
        }
      }

      // 2. Captain Onboarding steps 0, 1, 2, 3 in live mode
      for (let step = 0; step < 4; step++) {
        await setupMockBackend(page, {
          role: "captain",
          driverApproved: false,
          onboardingDraft: {
            step,
            area_id: "chennai",
            vehicle_category: "bike",
            vehicle_number: "TN 09 AB 1234",
            vehicle_make: "Honda",
            vehicle_model: "Activa",
            vehicle_color: "Black",
            license_reference: "DL12345",
            insurance_reference: "POL12345",
            license_expires: "2030-12-31",
            insurance_expires: "2030-12-31",
          },
        });
        await page.goto("http://127.0.0.1:5184");
        await expect(page.locator("#app[data-ready=true]")).toBeVisible();
        await readyFonts(page);

        await saveScreenShots(page, { role: "captain", screen: `onboarding-step${step}`, vp, mode: "live" });
        copyFileSync(
          path.join(SCREENS_DIR, `captain-onboarding-step${step}-${vp.id}.png`),
          path.join(SCREENS_DIR, `captain-onboarding-${step}-${vp.id}.png`),
        );

        const audit = await auditLayout(page, { role: "captain", screen: `onboarding-step${step}`, vp, mode: "live" });
        if (audit.findings.length) {
          auditErrors.push({ screen: `onboarding-step${step}`, findings: audit.findings });
        }
      }

      expect(auditErrors, `Layout issues in Captain Live [${vp.id}]`).toEqual([]);
    });
  }
});
