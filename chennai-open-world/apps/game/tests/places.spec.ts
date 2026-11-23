/** Places the player can go into (home, hospital, gym, mall, cinema), their activities, and a story. */
import { expect, test, type Page } from "@playwright/test";
import { board, getOut, ready, snapshot, teleport } from "./support";

interface LifeState {
  day: number;
  fitness: number;
  trainedDay: number;
  outfit: string;
  owned: string[];
  films: string[];
  stories: string[];
}
interface PlaceState {
  places: Array<{ id: string; kind: string; name: string; x: number; z: number; radius: number }>;
  life: LifeState;
  story: string | null;
  storyStep: number;
  placeOpen: string | null;
  sprint: number;
  runSpeed: number;
  clothes: number | null;
  money: number;
  health: number;
  hour: number;
  held: boolean;
  mission: string | null;
  mode: string;
  target: { x: number; z: number } | null;
  x: number;
  yaw: number;
  z: number;
}
const state = (page: Page) => snapshot(page) as unknown as Promise<PlaceState>;
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("cow-progress-v1") ?? "null") as { completed: string[]; money: number; life?: LifeState } | null);
const setHealth = (page: Page, health: number) => page.evaluate((h) => (window as unknown as { __cow: { setHealth(h: number): void } }).__cow.setHealth(h), health);

/** Open the game with this stage save (an old-format save: no `life`). */
async function startWith(page: Page, completed: string[], money: number): Promise<void> {
  await page.goto("/?quality=lite&start=play");
  await page.evaluate(([done, cash]) => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: done, money: cash }));
  }, [completed, money] as const);
  await ready(page, true);
}

/** Walk up to a place's entrance and press ENTER ("Go inside"). */
async function goInside(page: Page, kind: string): Promise<void> {
  const place = (await state(page)).places.find((p) => p.kind === kind);
  if (!place) throw new Error(`No place ${kind}`);
  await teleport(page, place.x, place.z);
  const enter = page.getByRole("button", { name: "Go inside", exact: true });
  await expect(enter).toBeVisible({ timeout: 10_000 });
  // The press is read on the next step and the screen opens on the next frame, which holds the
  // game: so wait for the screen, not for game time.
  await enter.dispatchEvent("pointerdown", { pointerId: 41, pointerType: "touch" });
  await expect(page.getByTestId("place-screen")).toBeVisible({ timeout: 10_000 });
  const inside = await state(page);
  expect(inside.placeOpen).toBe(place.id);
  expect(inside.held).toBe(true);
}

async function leave(page: Page): Promise<void> {
  await page.getByTestId("place-leave").click();
  await expect(page.getByTestId("place-screen")).toHaveCount(0);
  expect((await state(page)).held).toBe(false);
}

/** Do the gym workout: tap whenever the needle is drawn in the middle of the green zone. */
async function workout(page: Page): Promise<void> {
  await expect(page.getByTestId("workout-tap")).toBeVisible();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const step = () => {
          const bar = document.querySelector<HTMLElement>("[data-testid=workout-bar]");
          const tap = document.querySelector<HTMLButtonElement>("[data-testid=workout-tap]");
          if (!bar || !tap) {
            resolve();
            return;
          }
          const needle = Number(bar.dataset.needle);
          if (needle >= 0.42 && needle <= 0.58) tap.click();
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
  );
}

test("places are on the map; an old save loads; home: sleep until morning and change clothes", async ({ page }) => {
  await startWith(page, ["morning-walk"], 120);
  const start = await state(page);
  expect(start.places.map((p) => p.kind).sort()).toEqual(["cinema", "gym", "home", "hospital", "mall"]);
  // An old save has no life state: everything starts fresh, and the stage progress is kept.
  expect(start.life).toEqual({ day: 0, fitness: 0, trainedDay: -1, outfit: "everyday", owned: ["everyday", "festival"], films: [], stories: [] });
  expect(start.mission).toBe("borrowed-wheels");
  expect(start.money).toBe(120);

  await goInside(page, "home");
  await expect(page.getByTestId("place-screen")).toContainText("Home");
  await setHealth(page, 30);
  const before = await state(page);
  expect(before.health).toBe(30);
  await page.getByTestId("home-sleep").click();
  await expect(page.getByTestId("place-text")).toContainText("07:00");
  const rested = await state(page);
  expect(rested.hour).toBeCloseTo(7, 2);
  expect(rested.health).toBe(100);
  // The game starts in the evening, so the night crosses midnight: a new day.
  expect(rested.life.day).toBe(before.life.day + 1);
  // Sleeping saved the game: the stage save keeps its fields and gains the life state.
  const save = await saved(page);
  expect(save?.completed).toEqual(["morning-walk"]);
  expect(save?.money).toBe(120);
  expect(save?.life?.day).toBe(1);
  expect(Number(await page.evaluate(() => localStorage.getItem("cow-hour-v1")))).toBeCloseTo(7, 2);

  const colour = rested.clothes;
  await page.getByTestId("home-clothes").click();
  const dressed = await state(page);
  expect(dressed.life.outfit).toBe("festival");
  expect(dressed.clothes).not.toBe(colour);
  await leave(page);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const reloaded = await state(page);
  expect(reloaded.life.outfit).toBe("festival");
  expect(reloaded.life.day).toBe(1);
  expect(reloaded.money).toBe(120);
  expect(reloaded.mission).toBe("borrowed-wheels");
  expect(reloaded.hour).toBeGreaterThan(6.9);
  expect(reloaded.hour).toBeLessThan(8);
});

test("hospital: treatment restores health for a fee, and is free after driving the ambulance", async ({ page }) => {
  await startWith(page, [], 1000);
  await goInside(page, "hospital");
  await setHealth(page, 40);
  const before = await state(page);
  await page.getByTestId("hospital-treat").click();
  await expect(page.getByTestId("place-text")).toContainText("₹180");
  const treated = await state(page);
  // ₹3 a missing point: 60 missing.
  expect(treated.money).toBe(1000 - 180);
  expect(treated.health).toBe(100);
  expect(treated.hour - before.hour).toBeCloseTo(0.5, 3);
  await leave(page);

  // Drive the ambulance, get out, and walk in: no fee.
  await board(page, "ambulance");
  await getOut(page);
  expect((await state(page)).mode).toBe("foot");
  await goInside(page, "hospital");
  await setHealth(page, 50);
  await expect(page.getByTestId("hospital-treat")).toBeVisible();
  await page.getByTestId("hospital-treat").click();
  await expect(page.getByTestId("place-text")).toContainText("free");
  const free = await state(page);
  expect(free.money).toBe(820);
  expect(free.health).toBe(100);
});

test("gym: a good workout raises fitness and sprint speed once a day", async ({ page }) => {
  await startWith(page, [], 500);
  const start = await state(page);
  expect(start.runSpeed).toBeCloseTo(6.2, 3);
  await goInside(page, "gym");
  const before = await state(page);
  await page.getByTestId("gym-workout").click();
  await workout(page);
  await expect(page.getByTestId("place-text")).toContainText("Fitness 1/5");
  const trained = await state(page);
  expect(trained.life.fitness).toBe(1);
  expect(trained.sprint).toBeCloseTo(1.02, 5);
  expect(trained.runSpeed).toBeCloseTo(6.2 * 1.02, 3);
  expect(trained.money).toBe(450);
  expect(trained.hour - before.hour).toBeCloseTo(1, 3);

  // Again the same day: paid for, but it does not count.
  await page.getByTestId("gym-workout").click();
  await workout(page);
  await expect(page.getByTestId("place-text")).toContainText("tomorrow");
  const again = await state(page);
  expect(again.life.fitness).toBe(1);
  expect(again.money).toBe(400);
  expect((await saved(page))?.life?.fitness).toBe(1);
});

test("mall: the escalator queue, snacks restore health, clothes come with free socks", async ({ page }) => {
  await startWith(page, [], 2000);
  const outside = await state(page);
  await goInside(page, "mall");
  await expect(page.getByTestId("place-text")).toContainText("escalator");
  await expect(page.getByTestId("place-text")).toContainText("BUY 1 GET 1");
  const inside = await state(page);
  // Ten minutes in the escalator queue (plus the moments of play while teleporting).
  expect(inside.hour - outside.hour).toBeGreaterThan(1 / 6 - 0.001);
  expect(inside.hour - outside.hour).toBeLessThan(1 / 6 + 0.1);

  await setHealth(page, 50);
  await page.getByTestId("buy-bajji-plate").click();
  await expect(page.getByTestId("place-text")).toContainText("+20 health");
  const fed = await state(page);
  expect(fed.health).toBe(70);
  expect(fed.money).toBe(1940);

  await page.getByTestId("buy-maroon-shirt").click();
  await expect(page.getByTestId("place-text")).toContainText("socks");
  const shopped = await state(page);
  expect(shopped.money).toBe(1340);
  expect(shopped.life.outfit).toBe("maroon-shirt");
  expect(shopped.life.owned).toContain("socks");
  await expect(page.getByTestId("buy-maroon-shirt")).toBeDisabled();
  expect((await saved(page))?.life?.owned).toContain("maroon-shirt");
});

test("cinema: buy a ticket, watch with the audience, popcorn at the interval; time passes", async ({ page }) => {
  await startWith(page, [], 500);
  await goInside(page, "cinema");
  const before = await state(page);
  await page.getByTestId("film-sambar-sunday").click();
  await expect(page.getByTestId("place-text")).toContainText("Sambar Sunday");
  const lines: string[] = [];
  for (let i = 0; i < 7; i++) {
    lines.push((await page.getByTestId("place-text").textContent()) ?? "");
    if (i === 4) {
      await page.getByTestId("buy-popcorn").click();
      await expect(page.getByTestId("place-text")).toContainText("Popcorn");
    }
    await page.getByTestId("scene-next").click();
  }
  const all = lines.join(" ");
  expect(all).toMatch(/whistles/);
  expect(all).toMatch(/phone rings/);
  expect(all).toMatch(/INTERVAL/);
  await expect(page.getByTestId("place-text")).toContainText("is over");
  const after = await state(page);
  expect(after.money).toBe(500 - 150 - 60);
  // Waiting for the next show, then the 2.5-hour film.
  const shows = [11, 14.5, 18.5, 21.5];
  const next = shows.find((s) => s >= before.hour) ?? shows[0]!;
  const passed = (((next - before.hour) % 24) + 24) % 24 + 2.5;
  expect((((after.hour - before.hour) % 24) + 24) % 24).toBeCloseTo(passed, 3);
  expect(after.life.films).toEqual(["sambar-sunday"]);
});

test("story: take Paati to the hospital for her check-up and bring her home", async ({ page }) => {
  await ready(page);
  const spawn = await state(page);
  await goInside(page, "home");
  await page.getByTestId("story-paati-checkup").click();
  await expect(page.getByTestId("place-screen")).toHaveCount(0);
  expect((await state(page)).story).toBe("paati-checkup");
  await expect(page.getByTestId("mission")).toContainText("Get in a car");

  await board(page, "car-start");
  await expect.poll(async () => (await state(page)).storyStep, { timeout: 8000 }).toBe(1);
  const hospital = (await state(page)).target!;
  await teleport(page, hospital.x, hospital.z);
  await expect.poll(async () => (await state(page)).storyStep, { timeout: 8000 }).toBe(2);
  // Park back at the start, so the car is not in the hospital's doorway, and walk in.
  await teleport(page, spawn.x, spawn.z, spawn.yaw);
  await getOut(page);
  await goInside(page, "hospital");
  await page.getByTestId("story-step").click();
  for (let i = 0; i < 3; i++) await page.getByTestId("scene-next").click();
  await expect(page.getByTestId("place-text")).toContainText("Check-up done");
  expect((await state(page)).storyStep).toBe(3);
  await leave(page);

  await board(page, "car-start");
  const home = (await state(page)).target!;
  await teleport(page, home.x, home.z);
  await expect.poll(async () => (await state(page)).story, { timeout: 8000 }).toBeNull();
  const done = await state(page);
  expect(done.money).toBe(400);
  expect(done.life.stories).toEqual(["paati-checkup"]);
  expect((await saved(page))?.life?.stories).toEqual(["paati-checkup"]);
});
