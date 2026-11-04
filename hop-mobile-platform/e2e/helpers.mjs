// Shared steps for the end-to-end tests (Rider + Captain apps on a real API).
import { expect } from "@playwright/test";

export const RIDER = "http://127.0.0.1:5183";
export const CAPTAIN = "http://127.0.0.1:5184";

export async function signIn(page, url, phone) {
  await page.goto(url);
  await expect(page.locator(".login-screen")).toBeVisible();
  await page.locator("#demo-phone").fill(phone);
  await page.getByRole("button", { name: "Send sign-in code", exact: true }).click();
  // Development servers accept 123456; they never send an SMS.
  await page.getByLabel("Six-digit SMS code").fill("123456");
  await page.getByRole("button", { name: "Verify & continue", exact: true }).click();
}

// A simulated phone GPS. Chrome only reports a simulated location when it changes, but a real
// receiver keeps reporting (with a little jitter) while the phone stands still, so this does too.
export function phoneGps(context, start) {
  let at = { ...start }, n = 0;
  const jitter = () => (n++ % 2 ? 1 : -1) * 0.000003; // about 30 cm
  const timer = setInterval(() => {
    void context.setGeolocation({ latitude: at.latitude + jitter(), longitude: at.longitude, accuracy: 10 }).catch(() => {});
  }, 3000);
  return {
    // Moves the phone in small steps, as a real GPS would while driving.
    async drive(page, to, steps = 8) {
      const from = at;
      for (let i = 1; i <= steps; i++) {
        at = {
          latitude: from.latitude + ((to.latitude - from.latitude) * i) / steps,
          longitude: from.longitude + ((to.longitude - from.longitude) * i) / steps,
        };
        await context.setGeolocation({ ...at, accuracy: 10 });
        await page.waitForTimeout(2200);
      }
    },
    stop: () => clearInterval(timer),
  };
}

export const state = async (context, url) => (await context.request.get(`${url}/api/state`)).json();


// Types a place and picks the first result. The public place search can be slow or time out;
// like a person, retype once before giving up.
async function pickPlace(rider, box, text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await box.fill("");
    await box.fill(text);
    const result = rider.locator("[data-live-place]").first();
    try {
      await expect(result).toBeVisible({ timeout: 20000 });
      await result.click({ timeout: 5000 });
      return;
    } catch (error) {
      if (attempt) throw new Error(`Place search for "${text}" gave no results (public search service slow or down)`);
    }
  }
}

// Books a city ride with real place search, paying cash (a new rider's wallet is empty).
export async function book(rider, from, to) {
  await rider.getByRole("button", { name: "Where are you going?" }).click();
  await pickPlace(rider, rider.getByRole("textbox", { name: "Pickup location", exact: true }), from);
  await pickPlace(rider, rider.getByRole("textbox", { name: "Search destination" }), to);
  await expect(rider.locator(".footer-price strong")).toHaveText(/^₹\d+(\.\d{2})?$/, { timeout: 30000 });
  const fare = (await rider.locator(".footer-price strong").innerText()).trim();
  await rider.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(rider.getByRole("button", { name: /Payment method/ })).toContainText("Cash", { timeout: 15000 });
  await rider.getByRole("button", { name: "Request a ride" }).click();
  await expect(rider.getByRole("button", { name: "Cancel request" })).toBeVisible({ timeout: 15000 });
  return fare;
}
