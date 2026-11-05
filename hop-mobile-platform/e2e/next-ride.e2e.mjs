// "Next ride": a captain about to drop a rider off is offered a new request near that drop-off,
// accepts it during the trip, settles the first trip's payment, then heads straight to the next
// pickup. The second rider is told a captain is finishing a trip nearby.
import { test, expect } from "@playwright/test";
import { RIDER, CAPTAIN, signIn, phoneGps, state, book } from "./helpers.mjs";

const CAPTAIN_PHONE = process.env.HOP_E2E_CAPTAIN_PHONE || "9000000002";
const stamp = String(Date.now()).slice(-4);
const FIRST_RIDER = process.env.HOP_E2E_RIDER_PHONE ? `${process.env.HOP_E2E_RIDER_PHONE.slice(0, 6)}${stamp}` : `900000${stamp}`;
const SECOND_RIDER = `900003${stamp}`;
const START = { latitude: 13.0067, longitude: 80.2206, accuracy: 10 }; // Guindy

// A versioned ride action through the app's own API, used only to clean up at the end.
async function rideAction(context, url, ride, action, extra = {}) {
  const me = await (await context.request.get(`${url}/api/me`)).json();
  const res = await context.request.post(`${url}/api/rides/${ride.id}/actions`, {
    headers: { Origin: url, "X-CSRF-Token": me.csrf, "Content-Type": "application/json" },
    data: { action, version: ride.version, ...extra },
  });
  expect(res.ok(), `${action}: ${res.status()} ${await res.text()}`).toBeTruthy();
}

test("a captain finishing a trip nearby takes the next ride, settles the first, then heads to the next pickup", async ({ browser }) => {
  const captainCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const firstCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const secondCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const [captain, first, second] = await Promise.all([captainCtx.newPage(), firstCtx.newPage(), secondCtx.newPage()]);
  // The test captain completes away from the drop-off, so the app asks to confirm an early finish.
  captain.on("dialog", (dialog) => void dialog.accept());
  const gps = phoneGps(captainCtx, START);

  // 1. A normal ride starts: Guindy → Kotturpuram.
  await signIn(captain, CAPTAIN, CAPTAIN_PHONE);
  await captain.getByRole("button", { name: "Go online" }).click();
  await expect.poll(async () => (await state(captainCtx, CAPTAIN)).driver[0]?.online, { timeout: 20000 }).toBe(true);
  await signIn(first, RIDER, FIRST_RIDER);
  await book(first, "Guindy", "Kotturpuram");
  await expect(captain.getByRole("button", { name: "Accept ride", exact: true })).toBeVisible({ timeout: 30000 });
  await captain.getByRole("button", { name: "Accept ride", exact: true }).press("Enter");
  await expect.poll(async () => (await state(firstCtx, RIDER)).rides.some((r) => r.status === "accepted"), { timeout: 15000 }).toBe(true);
  const trip = (await state(firstCtx, RIDER)).rides.find((r) => r.status === "accepted");
  const pickup = { latitude: trip.pickup_lat, longitude: trip.pickup_lng };
  const dropoff = { latitude: trip.dropoff_lat, longitude: trip.dropoff_lng };
  await gps.drive(captain, pickup, 4);
  await captain.getByRole("button", { name: "I’ve arrived" }).click();
  const code = (await state(firstCtx, RIDER)).rides.find((r) => r.id === trip.id).pickup_code;
  for (const [i, digit] of [...code].entries()) await captain.locator(`#pin-${i}`).fill(digit);
  await captain.getByRole("button", { name: "Verify & start ride" }).click();
  await expect(captain.getByRole("button", { name: "Complete trip" })).toBeVisible({ timeout: 15000 });

  // 2. Most of the way there (a few hundred metres to go), a second rider asks for a pickup
  //    right by that drop-off. With no free captain nearby, this captain gets it as a next ride.
  await gps.drive(captain, { latitude: pickup.latitude + (dropoff.latitude - pickup.latitude) * 0.85, longitude: pickup.longitude + (dropoff.longitude - pickup.longitude) * 0.85 }, 5);
  await secondCtx.setGeolocation(dropoff);
  await signIn(second, RIDER, SECOND_RIDER);
  await book(second, "Kotturpuram", "Adyar");
  const card = captain.locator(".next-ride-card");
  await expect(card.getByRole("button", { name: "Accept next ride" })).toBeVisible({ timeout: 40000 });
  await expect(card).toContainText("Close to this drop-off");
  await card.getByRole("button", { name: "Accept next ride" }).click();
  await expect(card).toContainText("Next ride booked", { timeout: 15000 });
  await expect(second.locator(".matching-radar-status strong")).toContainText("is finishing a trip nearby", { timeout: 20000 });
  const held = (await state(secondCtx, RIDER)).rides.find((r) => r.status === "requested");
  expect(held).toMatchObject({ next_ride: true });

  // 3. The captain completes the first trip: its payment comes first, then the next pickup.
  await gps.drive(captain, dropoff, 3);
  await captain.getByRole("button", { name: "Complete trip" }).press("Enter");
  await expect(captain.getByRole("button", { name: "Record payment received" })).toBeVisible({ timeout: 15000 });
  await first.getByRole("button", { name: "I’ve paid my Captain" }).click();
  await captain.getByRole("button", { name: "Record payment received" }).click();
  await captain.getByRole("button", { name: "Yes, payment received" }).click();
  await expect(captain.getByRole("heading", { name: "Cash received." })).toBeVisible({ timeout: 20000 });
  await captain.getByRole("button", { name: "Done", exact: true }).click();
  await expect(captain.getByRole("button", { name: "I’ve arrived" })).toBeVisible({ timeout: 15000 });
  const next = (await state(secondCtx, RIDER)).rides.find((r) => r.id === held.id);
  expect(next.status).toBe("accepted");
  expect(next.driver_name).not.toMatch(/^Rider /);
  await expect(second.locator(".sheet").first()).toContainText(next.driver_name, { timeout: 15000 });

  // Leave nothing behind for the next test: the second rider cancels and the captain goes offline.
  await rideAction(secondCtx, RIDER, next, "cancel", { reason: "End of the end-to-end test" });
  const me = await (await captainCtx.request.get(`${CAPTAIN}/api/me`)).json();
  const offline = await captainCtx.request.post(`${CAPTAIN}/api/drivers/offline`, { headers: { Origin: CAPTAIN, "X-CSRF-Token": me.csrf, "Content-Type": "application/json" }, data: {} });
  expect(offline.ok(), `offline: ${offline.status()}`).toBeTruthy();
  gps.stop();
});
