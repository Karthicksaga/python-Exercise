/**
 * The loading screen, the title menu over the live city, and the pause menu's buttons on short
 * screens. Unlike the other specs this one opens the game WITHOUT `start=play`, as a player does.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { snapshot, waitGameTime } from "./support";

/** The six step labels of `LOAD_STEPS` in `Game.ts`, in order. */
const STEPS = [
  "Reading the map of Chennai",
  "Starting the physics",
  "Building the streets around you",
  "Bringing people onto the streets",
  "Parking vehicles and starting traffic",
  "Opening the railway stations",
];

const title = (page: Page) => page.getByTestId("title");
const menuButton = (page: Page, name: string) => title(page).getByRole("button", { name, exact: true });

/** Record every text the loading screen's status line shows, from the very first frame. */
async function recordSteps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __steps: string[] }).__steps = seen;
    const watch = (): void => {
      const line = document.querySelector("#loading .ld-step");
      if (!line) return;
      seen.push(line.textContent ?? "");
      new MutationObserver(() => seen.push(line.textContent ?? "")).observe(line, { childList: true, characterData: true, subtree: true });
    };
    document.addEventListener("DOMContentLoaded", watch);
  });
}

/** Open the game as a player does (no `start=play`), with this save, and wait for the title menu. */
async function openTitle(page: Page, save?: Record<string, string>): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?quality=lite");
  await page.evaluate((entries) => {
    localStorage.clear();
    for (const [key, value] of Object.entries(entries ?? {})) localStorage.setItem(key, value);
  }, save);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "title", { timeout: 60_000 });
  await expect(title(page)).toBeVisible();
  return errors;
}

/** Wait until no CSS transition or animation is running (a page sliding in, the entrance). */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"));

/** The element is wholly inside the window (not cut off by an edge). */
async function expectOnScreen(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const size = locator.page().viewportSize()!;
  expect(box, "element has a box").not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(size.height + 0.5);
  expect(box!.x + box!.width).toBeLessThanOrEqual(size.width + 0.5);
}

test("loading screen reports each real step, then the title menu shows over the paused city", async ({ page }) => {
  await recordSteps(page);
  const errors = await openTitle(page);

  // Every step of Game.create was named, in order, and the bar finished on "Ready".
  const seen = await page.evaluate(() => (window as unknown as { __steps: string[] }).__steps);
  const steps = seen.filter((text) => STEPS.includes(text));
  expect([...new Set(steps)]).toEqual(STEPS);
  expect(seen.at(-1)).toBe("Ready");
  await expect(page.locator("#loading")).toHaveCount(0, { timeout: 5_000 });

  // A fresh game: PLAY (stage 1), no CONTINUE or NEW GAME, and no QUIT in a browser.
  for (const name of ["Play", "Settings", "Controls", "About"]) await expectOnScreen(menuButton(page, name));
  await expect(menuButton(page, "Play")).toHaveAccessibleDescription(/^Stage 1 · /);
  await expect(menuButton(page, "Continue")).toHaveCount(0);
  await expect(menuButton(page, "New game")).toHaveCount(0);
  await expect(menuButton(page, "Quit")).toHaveCount(0);
  await expect(title(page).getByText("Map data © OpenStreetMap contributors", { exact: true })).toBeVisible();

  // The game waits behind the menu: HUD and controls hidden, nothing simulated.
  const before = await snapshot(page);
  expect(before).toMatchObject({ screen: "title", paused: true });
  await expect(page.locator(".cow-hud")).toBeHidden();
  await page.waitForTimeout(800);
  expect((await snapshot(page)).simTime).toBe(before.simTime);
  expect(errors).toEqual([]);
});

test("PLAY starts the game where the player stands", async ({ page }) => {
  await openTitle(page);
  const before = await snapshot(page);
  await menuButton(page, "Play").tap();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
  await expect(title(page)).toBeHidden();
  await expect(page.locator(".cow-hud")).toBeVisible();
  await expect(page.getByTestId("mission")).toContainText("Stage 1");
  const after = await snapshot(page);
  expect(after).toMatchObject({ screen: "game", paused: false });
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1);
  await waitGameTime(page, 0.5);
});

test("settings change the time of day and the weather, live and remembered", async ({ page }) => {
  await openTitle(page);
  await menuButton(page, "Settings").tap();
  const time = title(page).locator('[data-action="time"]');
  const weather = title(page).locator('[data-action="weather"]');
  await expect(time).toBeVisible();
  // The main page is out of the way (inert), not merely covered.
  await expect(menuButton(page, "Play")).toBeHidden();

  const firstTime = await time.getAttribute("aria-label");
  await time.tap();
  await expect(time).not.toHaveAttribute("aria-label", firstTime!);
  expect(await page.evaluate(() => localStorage.getItem("cow-hour-v1"))).not.toBeNull();

  await expect(weather).toHaveAttribute("aria-label", "Weather: Clear");
  await weather.tap();
  await expect(weather).toHaveAttribute("aria-label", "Weather: Rain");
  expect(await page.evaluate(() => localStorage.getItem("cow-weather-v1"))).toBe("rain");
  // The location card follows.
  await expect(title(page).locator(".ct-place")).toContainText("Rain");

  await menuButton(page, "Back").tap();
  await expect(menuButton(page, "Settings")).toBeVisible();
  await expect(menuButton(page, "Settings")).toHaveClass(/is-selected/);
});

test("the menu works from a keyboard: arrows select, Enter opens, Escape goes back", async ({ page }) => {
  await openTitle(page);
  const selected = title(page).locator(".ct-page.current .ct-item.is-selected .ct-label");
  await expect(selected).toHaveText("Play");
  await page.keyboard.press("ArrowDown");
  await expect(selected).toHaveText("Settings");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(selected).toHaveText("About");
  await page.keyboard.press("Enter");
  await expect(title(page).locator('[data-page="about"]')).toHaveClass(/current/);
  await expect(title(page).getByText(/OpenStreetMap contributors, extract of \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(selected).toHaveText("About");
  await page.keyboard.press("Home");
  await expect(selected).toHaveText("Play");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
});

test("a saved game offers CONTINUE, and NEW GAME asks before forgetting it", async ({ page }) => {
  await openTitle(page, { "cow-progress-v1": JSON.stringify({ completed: [], money: 750 }) });
  await expect(menuButton(page, "Continue")).toHaveAccessibleDescription(/₹750 · 0 of \d+ stages/);
  await expect(menuButton(page, "Play")).toHaveCount(0);

  // Cancel keeps the save.
  await menuButton(page, "New game").tap();
  await expect(title(page).getByText(/Start again from Stage 1\?/)).toBeVisible();
  await menuButton(page, "Cancel").tap();
  await expect(menuButton(page, "Continue")).toBeVisible();

  await menuButton(page, "New game").tap();
  await menuButton(page, "Start new game").tap();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 20_000 });
  expect((await snapshot(page)).money).toBe(0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cow-progress-v1") ?? "null") as { money: number } | null);
  expect(saved?.money).toBe(0);
});

test("every menu button stays on screen from a small landscape phone to a desktop", async ({ page }) => {
  await openTitle(page);
  for (const size of [
    { width: 915, height: 412 },
    { width: 640, height: 320 },
    { width: 412, height: 915 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await settled(page);
    for (const name of ["Play", "Settings", "Controls", "About"]) await expectOnScreen(menuButton(page, name));
    await menuButton(page, "Settings").click();
    // Measure where the page comes to rest, not part-way through its slide in.
    await settled(page);
    for (const name of ["Time of day", "Weather", "Back"]) {
      const button = title(page).locator(`.ct-page.current [aria-label^="${name}"]`);
      await button.scrollIntoViewIfNeeded();
      await expectOnScreen(button);
    }
    await page.keyboard.press("Escape");
    await settled(page);
  }
});

test.describe("inside the Android app", () => {
  // A stand-in for the React Native shell: records what the game sends it.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const posted: string[] = [];
      (window as unknown as { __posted: string[] }).__posted = posted;
      (window as unknown as { ReactNativeWebView: { postMessage(m: string): void } }).ReactNativeWebView = { postMessage: (m) => posted.push(m) };
    });
  });
  const posted = async (page: Page) => (await page.evaluate(() => (window as unknown as { __posted: string[] }).__posted)).map((m) => JSON.parse(m) as { type: string });
  const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new CustomEvent("cow-shell", { detail: JSON.stringify({ type: "back" }) })));

  test("loading reports to the shell: the device, every step in order, heartbeats, then loaded", async ({ page }) => {
    await openTitle(page);
    await expect.poll(async () => (await posted(page)).some((m) => m.type === "loaded")).toBe(true);
    const all = (await posted(page)) as Array<{ type: string; step?: string; gpu?: string; at?: number }>;
    const device = all.find((m) => m.type === "device");
    expect(device?.gpu).toBeTruthy();
    expect(all.filter((m) => m.type === "loading").map((m) => m.step)).toEqual(["world", "physics", "streets", "people", "traffic", "rail"]);
    // The shell tells a stuck script from a drawing failure by these.
    expect(all.some((m) => m.type === "alive")).toBe(true);
    expect(all.filter((m) => m.type === "problem")).toEqual([]);
    // Heartbeats stop once loading is done.
    const count = all.filter((m) => m.type === "alive").length;
    // Wall clock on purpose: the heartbeat is a 2 s timer, and on the title game time stands still.
    await page.waitForTimeout(2500);
    expect((await posted(page)).filter((m) => m.type === "alive").length).toBe(count);
  });

  test("the pause menu keeps every button reachable on a short screen, and MAIN MENU returns to the title", async ({ page }) => {
    await page.setViewportSize({ width: 915, height: 360 });
    await openTitle(page);
    await expectOnScreen(menuButton(page, "Quit"));
    await menuButton(page, "Play").tap();
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
    const where = await snapshot(page);

    await page.locator(".cow-pause").tap();
    const overlay = page.locator(".cow-overlay");
    await expect(overlay.getByRole("heading", { name: "Paused" })).toBeVisible();
    // Before the fix the six buttons were centred in a box that could not scroll: on a short
    // screen the first and last fell off the edges. Now each one can be brought into view.
    for (const name of ["Resume", "Share progress", /^Time: /, /^Weather: /, "New game", "Main menu"]) {
      const button = overlay.getByRole("button", { name, exact: typeof name === "string" });
      await button.scrollIntoViewIfNeeded();
      await expectOnScreen(button);
    }
    // At the tests' usual phone size they all fit at once.
    await page.setViewportSize({ width: 915, height: 412 });
    await overlay.evaluate((node) => node.scrollTo(0, 0));
    for (const name of ["Resume", "Main menu"]) await expectOnScreen(overlay.getByRole("button", { name, exact: true }));

    await overlay.getByRole("button", { name: "Main menu", exact: true }).tap();
    await expect(title(page)).toBeVisible();
    expect((await snapshot(page)).screen).toBe("title");
    await expect(page.locator(".cow-hud")).toBeHidden();
    // Leaving to the menu is not quitting.
    expect((await posted(page)).some((m) => m.type === "exit")).toBe(false);

    await menuButton(page, "Play").tap();
    await expect(title(page)).toBeHidden();
    const resumed = await snapshot(page);
    expect(resumed).toMatchObject({ screen: "game", paused: false });
    expect(Math.hypot(resumed.x - where.x, resumed.z - where.z)).toBeLessThan(2);
  });

  test("Android Back: pause, then the title menu, then out of a sub-page, then quit", async ({ page }) => {
    await openTitle(page);
    await menuButton(page, "Play").tap();
    await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
    await back(page);
    await expect(page.locator(".cow-overlay").getByRole("heading", { name: "Paused" })).toBeVisible();
    await back(page);
    await expect(title(page)).toBeVisible();
    await menuButton(page, "Settings").tap();
    await back(page);
    await expect(menuButton(page, "Settings")).toBeVisible();
    expect((await posted(page)).some((m) => m.type === "exit")).toBe(false);
    await back(page);
    await expect.poll(async () => (await posted(page)).some((m) => m.type === "exit")).toBe(true);

    // QUIT on the menu asks the app to close too.
    await menuButton(page, "Quit").tap();
    await expect.poll(async () => (await posted(page)).filter((m) => m.type === "exit").length).toBe(2);
  });
});
