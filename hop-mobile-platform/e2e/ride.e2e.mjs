// One complete ride between the Rider and Captain apps, against the real local API that
// e2e/run-local.sh starts. Place search and road routes use live services, so results can vary
// slightly; the test reads the values the server returns instead of assuming them.
import { test, expect } from "@playwright/test";

const RIDER = "http://127.0.0.1:5183";
const CAPTAIN = "http://127.0.0.1:5184";
// Local: approved by e2e/seed.mjs. Staging: an approved test captain (see e2e/README.md).
const CAPTAIN_PHONE = process.env.HOP_E2E_CAPTAIN_PHONE || "9000000002";
const RIDER_PHONE = process.env.HOP_E2E_RIDER_PHONE || "9000000003";
const START = { latitude: 13.0067, longitude: 80.2206, accuracy: 10 }; // Guindy

async function signIn(page, url, phone) {
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
function phoneGps(context, start) {
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

const state = async (context, url) => (await context.request.get(`${url}/api/state`)).json();

test("a rider books, rides, pays cash and rates; the captain accepts, drives, confirms the cash and rates", async ({ browser }) => {
  const captainCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const riderCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const captain = await captainCtx.newPage();
  const gps = phoneGps(captainCtx, START);
  const rider = await riderCtx.newPage();
  const sampleCaptain = /Arun Kumar|Meet Arun/; // the design preview's sample, never live data

  // 1. The captain goes online, which also starts sharing their location.
  await signIn(captain, CAPTAIN, CAPTAIN_PHONE);
  await captain.getByRole("button", { name: "Go online" }).click();
  await expect.poll(async () => (await state(captainCtx, CAPTAIN)).driver[0], { timeout: 20000 })
    .toMatchObject({ online: true, lat: expect.closeTo(START.latitude, 4), lng: expect.closeTo(START.longitude, 4) });

  // 2. The rider books with real place search. A new rider's wallet is empty, so the ride
  //    starts on Cash instead of a request the server would refuse.
  await signIn(rider, RIDER, RIDER_PHONE);
  await rider.getByRole("button", { name: "Where are you going?" }).click();
  await rider.getByRole("textbox", { name: "Pickup location", exact: true }).fill("Guindy");
  await rider.locator("[data-live-place]").first().click();
  await rider.getByRole("textbox", { name: "Search destination" }).fill("Kotturpuram");
  await rider.locator("[data-live-place]").first().click();
  await expect(rider.locator(".footer-price strong")).toHaveText(/^₹\d+(\.\d{2})?$/, { timeout: 30000 });
  const fare = (await rider.locator(".footer-price strong").innerText()).trim();
  await rider.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(rider.getByRole("button", { name: /Payment method/ })).toContainText("Cash", { timeout: 15000 });
  await rider.getByRole("button", { name: "Request a ride" }).click();
  await expect(rider.getByRole("button", { name: "Cancel request" })).toBeVisible({ timeout: 15000 });

  // 3. The captain gets the request at the rider's fare, with no preview-only controls.
  await expect(captain.getByRole("button", { name: "Accept ride", exact: true })).toBeVisible({ timeout: 30000 });
  await expect(captain.locator(".driver-sheet .amount")).toHaveText(fare);
  await expect(captain.getByText(/Simulate/)).toHaveCount(0);
  await captain.getByRole("button", { name: "Accept ride", exact: true }).click();
  await expect(captain.getByRole("button", { name: "I’ve arrived" })).toBeVisible({ timeout: 15000 });

  // 4. The rider sees the real captain and vehicle, a live wait time and their pickup code.
  await expect.poll(async () => (await state(riderCtx, RIDER)).rides.find((r) => r.status === "accepted")?.driver_name, { timeout: 15000 }).toBeTruthy();
  const accepted = (await state(riderCtx, RIDER)).rides.find((r) => r.status === "accepted");
  expect(accepted.driver_name).not.toMatch(/^Rider /); // captains never carry the rider default name
  if (CAPTAIN_PHONE === "9000000002") expect(accepted.driver_name).toBe("Captain 0002");
  await expect(rider.locator(".sheet").first()).toContainText(accepted.driver_name, { timeout: 15000 });
  await expect(rider.locator(".sheet").first()).toContainText(accepted.vehicle_number);
  await expect(rider.locator(".hop-pickup-pin .hop-pin-callout")).toContainText(/Captain (\d+ min|is here)/, { timeout: 20000 });
  const code = (await rider.locator(".sheet").first().innerText()).match(/\b(\d{6})\b/)?.[1];
  expect(code, "pickup code").toBeTruthy();
  const ride = (await state(riderCtx, RIDER)).rides.find((r) => r.status === "accepted");
  const pickup = { latitude: ride.pickup_lat, longitude: ride.pickup_lng };
  const dropoff = { latitude: ride.dropoff_lat, longitude: ride.dropoff_lng };

  // 5. The captain drives to the pickup and arrives; the rider is told.
  await gps.drive(captain, pickup);
  await captain.getByRole("button", { name: "I’ve arrived" }).click();
  await expect(rider.locator(".hop-pickup-pin .hop-pin-callout")).toContainText("Captain is here", { timeout: 15000 });

  // 6. The rider's code starts the trip; the rider gets a real arrival time.
  for (const [i, digit] of [...code].entries()) await captain.locator(`#pin-${i}`).fill(digit);
  await captain.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(captain.getByRole("button", { name: "Complete trip" })).toBeVisible({ timeout: 15000 });
  await expect(rider.locator(".hop-dropoff-pin .hop-pin-callout")).toContainText(/Arrive \d{1,2}:\d{2}/, { timeout: 20000 });

  // 7. At the drop-off the captain completes; both see the same fare on the payment step.
  await gps.drive(captain, dropoff, 6);
  await captain.getByRole("button", { name: "Complete trip" }).click();
  await expect(captain.getByRole("button", { name: "Record payment received" })).toBeVisible({ timeout: 15000 });
  await expect(captain.locator(".payment-amount strong")).toHaveText(fare);
  await expect(rider.getByRole("button", { name: "Use cash" })).toBeVisible({ timeout: 15000 });
  await expect(rider.locator(".payment-amount strong")).toHaveText(fare);
  await expect(rider.locator("#app")).not.toContainText(sampleCaptain);

  // 8. Cash changes hands. The rider says they paid, which frees them to book again; the captain
  //    sees that and confirms it, which settles the trip.
  await rider.getByRole("button", { name: "Use cash" }).click();
  await rider.getByRole("button", { name: "I’ve paid my Captain" }).click();
  await expect(rider.getByRole("heading", { name: "Thanks, payment noted." })).toBeVisible({ timeout: 15000 });
  expect((await state(riderCtx, RIDER)).rides.find((r) => r.id === ride.id)).toMatchObject({ payment_status: "rider_reported_paid" });
  await expect(captain.getByRole("heading", { name: "Rider says they paid." })).toBeVisible({ timeout: 20000 });
  await expect(captain.getByRole("button", { name: "Cash not received" })).toBeVisible();
  await captain.getByRole("button", { name: "Record payment received" }).click();
  await captain.getByRole("button", { name: "Yes, payment received" }).click();
  await expect(rider.getByRole("heading", { name: "Payment handover recorded." })).toBeVisible({ timeout: 20000 });
  expect((await state(riderCtx, RIDER)).rides.find((r) => r.id === ride.id)).toMatchObject({ status: "completed", payment_status: "driver_reported_received" });

  // 8b. Each side rates the other once; the server keeps the score.
  await rider.getByRole("button", { name: "5 stars" }).click();
  await rider.getByRole("button", { name: "Send 5-star rating" }).click();
  await expect(rider.locator(".payment-rating")).toContainText("You rated your Captain ★★★★★", { timeout: 15000 });
  await expect(captain.getByRole("heading", { name: "Payment handover recorded." })).toBeVisible({ timeout: 15000 });
  await captain.getByRole("button", { name: "4 stars" }).click();
  await captain.getByRole("button", { name: "Send 4-star rating" }).click();
  await expect(captain.locator(".payment-rating")).toContainText("You rated your rider ★★★★", { timeout: 15000 });
  expect((await state(riderCtx, RIDER)).rides.find((r) => r.id === ride.id).my_rating).toBe(5);

  // 9. Both return to their start screens with nothing left over from the trip.
  await rider.getByRole("button", { name: "Done", exact: true }).click();
  await expect(rider.getByText("No active rides")).toBeVisible();
  await captain.getByRole("button", { name: "Done", exact: true }).click();
  await expect(captain.getByRole("button", { name: "Back to driving" })).toBeVisible();
  for (const page of [rider, captain]) await expect(page.locator("#app")).not.toContainText(sampleCaptain);
  gps.stop();
});
