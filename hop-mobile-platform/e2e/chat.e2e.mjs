// Rider ↔ Captain chat on the real local API (e2e/run-local.sh): two separate browsers, the real
// database listener, real long polling. Checks delivery speed, read receipts, typing, unread counts,
// quick replies, sending while offline (stored once), history after reopening, and closing.
import { test, expect } from "@playwright/test";
import { signIn, phoneGps, state, book, RIDER, CAPTAIN } from "./helpers.mjs";

const CAPTAIN_PHONE = process.env.HOP_E2E_CAPTAIN_PHONE || "9000000002";
const CAPTAIN_FIRST = CAPTAIN_PHONE === "9000000002" ? "Captain" : process.env.HOP_E2E_CAPTAIN_FIRST_NAME || "";
// A fresh rider for each repeat (--repeat-each), so back-to-back runs don't hit the rider's quote limit.
const riderPhone = (repeat) => process.env.HOP_E2E_CHAT_RIDER_PHONE || `90000004${String(repeat).padStart(2, "0")}`;
const START = { latitude: 13.0067, longitude: 80.2206, accuracy: 10 }; // Guindy

// Calls the API as a signed-in browser would (CSRF token from /api/me).
async function apiPost(context, origin, path, body) {
  const me = await (await context.request.get(`${origin}/api/me`)).json();
  return context.request.post(`${origin}${path}`, { data: body, headers: { "X-CSRF-Token": me.csrf, Origin: origin } });
}

test("rider and captain chat in real time during a trip", async ({ browser }, testInfo) => {
  const RIDER_PHONE = riderPhone(testInfo.repeatEachIndex);
  const captainCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const riderCtx = await browser.newContext({ geolocation: START, permissions: ["geolocation"] });
  const captain = await captainCtx.newPage();
  const rider = await riderCtx.newPage();
  const gps = phoneGps(captainCtx, START);
  try {
    // The rider sets a real name. (Renaming an approved captain sends the name back for review, so the
    // test captain keeps the seeded "Captain 0002"; chat shows first names.)
    await signIn(captain, CAPTAIN, CAPTAIN_PHONE);
    await expect(captain.getByRole("button", { name: "Go online" })).toBeVisible({ timeout: 20000 });
    await signIn(rider, RIDER, RIDER_PHONE);
    await expect(rider.getByRole("button", { name: "Where are you going?" })).toBeVisible({ timeout: 20000 });
    expect((await apiPost(riderCtx, RIDER, "/api/profile", { name: "Priya Sharma" })).ok()).toBe(true);

    // 1. A ride is booked and accepted.
    await captain.getByRole("button", { name: "Go online" }).click();
    // Online with a GPS fix, as a captain's phone would be before requests come in.
    await expect.poll(async () => (await state(captainCtx, CAPTAIN)).driver[0], { timeout: 20000 })
      .toMatchObject({ online: true, lat: expect.closeTo(START.latitude, 4), lng: expect.closeTo(START.longitude, 4) });
    await book(rider, "Guindy", "Kotturpuram");
    await expect(captain.getByRole("button", { name: "Accept ride", exact: true })).toBeVisible({ timeout: 30000 });
    await captain.getByRole("button", { name: "Accept ride", exact: true }).press("Enter");
    try {
      await expect(captain.getByRole("button", { name: "I’ve arrived" })).toBeVisible({ timeout: 15000 });
    } catch (error) {
      const offers = (await state(captainCtx, CAPTAIN)).offers?.map((o) => o.id);
      throw new Error(`Accept didn't open the pickup screen. On screen: "${await captain.locator("#app").innerText().catch(() => "")}". Offers now: ${JSON.stringify(offers)}`.slice(0, 1500), { cause: error });
    }
    await expect.poll(async () => (await state(riderCtx, RIDER)).rides.find((r) => r.status === "accepted")?.id, { timeout: 15000 }).toBeTruthy();
    const ride = (await state(riderCtx, RIDER)).rides.find((r) => r.status === "accepted");

    // 2. The captain writes first. The rider, still on the trip screen, gets a count and a notice fast.
    await captain.getByRole("button", { name: "Message", exact: true }).click();
    await expect(captain.locator(".app-head h1")).toHaveText("Priya · your rider");
    await expect(captain.getByText("Say hello. Only you and Priya can see these messages.")).toBeVisible({ timeout: 15000 });
    await captain.getByRole("textbox", { name: "Message" }).fill("Hi Priya, I'm on my way. Blue auto.");
    const sentAt = Date.now();
    await captain.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(captain.locator(".chat-meta").last()).toContainText("Sent", { timeout: 10000 });
    await expect(rider.getByRole("button", { name: "Message, 1 unread" })).toBeVisible({ timeout: 10000 });
    const delivery = Date.now() - sentAt;
    console.log(`Message reached the rider's trip screen in ${delivery} ms`);
    expect(delivery, "a message should reach the other phone within a few seconds").toBeLessThan(5000);

    // 3. The rider opens the chat: real name, the message, and the captain sees "Seen".
    await rider.getByRole("button", { name: "Message, 1 unread" }).click();
    if (CAPTAIN_FIRST) await expect(rider.locator(".app-head h1")).toHaveText(`${CAPTAIN_FIRST} · your captain`);
    else await expect(rider.locator(".app-head h1")).toHaveText(/ · your captain$/);
    await expect(rider.locator(".chat-bubble.partner")).toHaveText(["Hi Priya, I'm on my way. Blue auto."]);
    await expect(rider.locator("#app")).not.toContainText(/Arun|Demo Rider/);
    await expect(captain.locator(".chat-meta").last()).toContainText("Seen", { timeout: 10000 });

    // 4. Typing shows on the other phone, then the reply arrives live.
    await rider.getByRole("textbox", { name: "Message" }).pressSequentially("I'm at gate", { delay: 40 });
    await expect(captain.getByText("Priya is typing…")).toBeVisible({ timeout: 10000 });
    await rider.getByRole("textbox", { name: "Message" }).pressSequentially(" 2, near the bakery");
    await rider.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(captain.locator(".chat-bubble.partner")).toHaveText(["I'm at gate 2, near the bakery"], { timeout: 10000 });
    await expect(captain.getByText("Priya is typing…")).toHaveCount(0, { timeout: 10000 });

    // 5. Quick replies send real messages.
    await captain.getByRole("button", { name: "Hazard lights on" }).click();
    await expect(rider.locator(".chat-bubble.partner").last()).toHaveText("Hazard lights are on.", { timeout: 10000 });

    // 6. The rider loses signal and sends anyway: it shows as not sent, and goes out once when the
    //    connection is back, without the rider doing anything.
    await riderCtx.setOffline(true);
    await rider.getByRole("textbox", { name: "Message" }).fill("Can you see me? Red umbrella");
    await rider.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(rider.getByRole("button", { name: "Not sent · Tap to retry" })).toBeVisible({ timeout: 15000 });
    await expect(rider.getByText(/Reconnecting/)).toBeVisible({ timeout: 15000 });
    await riderCtx.setOffline(false);
    await expect(captain.locator(".chat-bubble.partner").last()).toHaveText("Can you see me? Red umbrella", { timeout: 30000 });
    await expect(rider.getByRole("button", { name: "Not sent · Tap to retry" })).toHaveCount(0, { timeout: 15000 });

    // 7. The server has every message exactly once, in order.
    const chatId = (await (await apiPost(riderCtx, RIDER, `/api/rides/${ride.id}/chat`, {})).json()).id;
    const stored = (await (await riderCtx.request.get(`${RIDER}/api/chats/${chatId}`)).json()).messages.map((m) => m.body);
    expect(stored).toEqual([
      "Hi Priya, I'm on my way. Blue auto.",
      "I'm at gate 2, near the bakery",
      "Hazard lights are on.",
      "Can you see me? Red umbrella",
    ]);

    // 8. Reopening the app keeps the history.
    await captain.reload();
    await expect(captain.getByRole("button", { name: "I’ve arrived" })).toBeVisible({ timeout: 20000 });
    await captain.getByRole("button", { name: /^Message/ }).click();
    await expect(captain.locator(".chat-bubble")).toHaveCount(4, { timeout: 15000 });

    // 9. The ride is cancelled: both see the chat close, and sending is refused.
    const latest = (await state(riderCtx, RIDER)).rides.find((r) => r.id === ride.id);
    expect((await apiPost(riderCtx, RIDER, `/api/rides/${ride.id}/actions`, { action: "cancel", version: latest.version, code: "", reason: "Change of plans" })).ok()).toBe(true);
    await expect(captain.getByText("This ride was cancelled, so chat is closed.")).toBeVisible({ timeout: 20000 });
    await expect(captain.getByRole("textbox", { name: "Message" })).toBeDisabled();
    const refused = await apiPost(captainCtx, CAPTAIN, `/api/chats/${chatId}/messages`, { client_id: crypto.randomUUID(), body: "Hello?" });
    expect(refused.status()).toBe(409);
  } finally {
    gps.stop();
    // Cancel anything the test left open, so a failure doesn't block the next test's rider.
    for (const r of (await state(riderCtx, RIDER).catch(() => ({ rides: [] }))).rides || [])
      if (["requested", "accepted", "arrived"].includes(r.status))
        await apiPost(riderCtx, RIDER, `/api/rides/${r.id}/actions`, { action: "cancel", version: r.version, code: "", reason: "Change of plans" }).catch(() => {});
    // Leave the shared test captain offline and free for the other tests.
    await apiPost(captainCtx, CAPTAIN, "/api/drivers/offline", {}).catch(() => {});
    await captainCtx.close();
    await riderCtx.close();
  }
});
