/**
 * Stages 16 to 21, each played through with the test hooks (teleport to skip the drives,
 * setWanted to lose the police, railAdvance to skip the train timetable, setHealth and
 * giveWeapon for the fight), the way `missions2.spec.ts` plays stages 11 to 15.
 */
import { expect, test, type Page } from "@playwright/test";
import { GAME_WAIT, board, holdButton, probe, ready, snapshot, tapButton, teleport, waitGameTime } from "./support";

const BEFORE = [
  "morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier", "park-trouble", "bike-thieves", "godown-raid", "roundtana-showdown",
  "courier-chase", "tea-shop", "drive-by", "snake-pit", "turf-war",
];
const LATER = ["wedding-party", "planted-chain", "mumbai-mail", "harmonium-thief", "stadium-biryani", "beach-road-brawl"];
const LINE = "beach-tambaram";

interface State {
  x: number;
  z: number;
  mode: string;
  money: number;
  health: number;
  reputation: number;
  mission: string | null;
  objective: string | null;
  target: { x: number; z: number } | null;
  quarry: { x: number; z: number } | null;
  enemies: Array<{ x: number; z: number; health: number; group: string }>;
  police: { stars: number };
  fare: { aboard: number; seated: number; stages: string[] } | null;
  rail: {
    riding: string | null;
    train: string | null;
    trains: Array<{ id: string; line: string; stoppedAt: string | null }>;
    stops: Array<{ line: string; name: string; footX: number; footZ: number; nextTrain: number }>;
  };
}
const state = async (page: Page) => (await snapshot(page)) as unknown as State;
type Hooks = { __cow: { giveWeapon(id: string, n: number): void; setHealth(h: number): void; setWanted(s: number): void; railAdvance(s: number): void } };
const heal = (page: Page) => page.evaluate(() => (window as unknown as Hooks).__cow.setHealth(100));

async function startAt(page: Page, id: string, money: number): Promise<void> {
  const done = [...BEFORE, ...LATER.slice(0, LATER.indexOf(id))];
  await page.goto("/?quality=lite");
  await page.evaluate(([list, cash]) => {
    localStorage.clear();
    localStorage.setItem("cow-progress-v1", JSON.stringify({ completed: JSON.parse(list as string), money: cash }));
  }, [JSON.stringify(done), money] as const);
  await ready(page, true);
  expect((await state(page)).mission).toBe(id);
}

const objective = (page: Page, label: string) => expect.poll(async () => (await state(page)).objective, { timeout: GAME_WAIT }).toBe(label);
async function goToTarget(page: Page): Promise<void> {
  const s = await state(page);
  await teleport(page, s.target!.x, s.target!.z);
}

test("stage 16: the wedding party of three gets into the auto on Westcott Road and out at the mandapam", async ({ page }) => {
  test.setTimeout(240_000);
  await startAt(page, "wedding-party", 30_000);
  const before = (await state(page)).reputation;
  await board(page, "auto-royapettah");
  await objective(page, "Pick up the wedding party on Westcott Road");
  expect((await state(page)).fare!.stages).toEqual(["waiting", "waiting", "waiting"]);
  await goToTarget(page);
  await objective(page, "Get them to the mandapam on North Mada Street, Mylapore");
  const riding = await state(page);
  expect(riding.fare!.aboard).toBe(3);
  expect(riding.fare!.seated).toBe(3);
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("planted-chain");
  const end = await state(page);
  expect(end.money).toBe(30_000 + 1800);
  expect(end.reputation).toBe(before + 3);
});

test("stage 17: a planted chain brings the police; lose them, then hand it in at the temple office", async ({ page }) => {
  test.setTimeout(180_000);
  await startAt(page, "planted-chain", 31_800);
  await goToTarget(page);
  await objective(page, "Someone planted a stolen chain on you: lose the police");
  // The stage raises the wanted level itself.
  await expect.poll(async () => (await state(page)).police.stars, { timeout: GAME_WAIT }).toBeGreaterThanOrEqual(2);
  // Not lost yet while they are after you.
  await waitGameTime(page, 1);
  expect((await state(page)).objective).toBe("Someone planted a stolen chain on you: lose the police");
  // Lost (the hook stands in for out-running them).
  await page.evaluate(() => (window as unknown as Hooks).__cow.setWanted(0));
  await objective(page, "Hand the chain in at the temple office, North Mada Street");
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("mumbai-mail");
  expect((await state(page)).money).toBe(31_800 + 2000);
});

test("stage 18: the singer gets into the car in Mylapore and out at Chennai Central, on time", async ({ page }) => {
  test.setTimeout(180_000);
  await startAt(page, "mumbai-mail", 33_800);
  await board(page, "car-mylapore");
  await objective(page, "Pick up the singer on South Mada Street");
  await goToTarget(page);
  await objective(page, "Drop her at Chennai Central, EVR Periyar Salai");
  expect((await state(page)).fare!.aboard).toBe(1);
  await goToTarget(page);
  // She gets out and walks to the station side of the road (here about 20 m: the kerb by the
  // marker is a junction), about 15 game seconds: slow on a software-rendered runner.
  await expect.poll(async () => (await state(page)).fare?.stages[0] ?? "done", { timeout: GAME_WAIT }).toMatch(/leaving|done/);
  await expect.poll(async () => (await state(page)).mission, { timeout: 2 * GAME_WAIT }).toBe("harmonium-thief");
  expect((await state(page)).money).toBe(33_800 + 2500);
});

test("stage 19: walk to Park station, ride the train to Egmore, and catch the thief on the motorbike", async ({ page }) => {
  test.setTimeout(300_000);
  await startAt(page, "harmonium-thief", 36_300);
  await goToTarget(page);
  await objective(page, "Take a train from Park to Chennai Egmore (BOARD on the platform)");
  const park = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === "Park")!;
  await teleport(page, park.footX, park.footZ);
  // Walking to Egmore does not count: it has to be the train.
  const wait = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === "Park")!.nextTrain;
  if (wait > 4) await page.evaluate((s) => (window as unknown as Hooks).__cow.railAdvance(s), wait - 4);
  await expect.poll(async () => (await state(page)).rail.trains.some((t) => t.line === LINE && t.stoppedAt === "Park"), { timeout: 120_000, intervals: [200] }).toBe(true);
  await tapButton(page, "Board the train");
  expect((await state(page)).rail.riding).toBe(LINE);
  const next = (await state(page)).rail.stops.find((s) => s.line === LINE && s.name === "Chennai Egmore")!.nextTrain;
  if (next > 4) await page.evaluate((s) => (window as unknown as Hooks).__cow.railAdvance(s), next - 4);
  await objective(page, "Step off and get on the motorbike outside Egmore station");
  await expect.poll(async () => {
    const rail = (await state(page)).rail;
    return rail.trains.find((t) => t.id === rail.train)?.stoppedAt ?? null;
  }, { timeout: 120_000, intervals: [200] }).toBe("Chennai Egmore");
  await tapButton(page, "Step off the train");
  await expect.poll(async () => (await state(page)).rail.riding, { timeout: GAME_WAIT }).toBeNull();
  await board(page, "bike-egmore");
  await objective(page, "Catch the thief on EVR Periyar Salai");
  for (let i = 0; i < 20; i++) {
    const s = await state(page);
    if (!s.objective?.startsWith("Catch")) break;
    if (s.quarry) await teleport(page, s.quarry.x, s.quarry.z);
  }
  await objective(page, "Bring the harmonium back to Egmore station");
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("stadium-biryani");
  // Less the train fare (a few rupees).
  const money = (await state(page)).money;
  expect(money).toBeGreaterThan(36_300 + 2800 - 30);
  expect(money).toBeLessThan(36_300 + 2800);
});

test("stage 20: biryani from Egmore to the Chepauk stadium against the clock", async ({ page }) => {
  test.setTimeout(180_000);
  await startAt(page, "stadium-biryani", 39_095);
  await board(page, "bike-egmore");
  await objective(page, "Collect the biryani near Egmore station");
  await goToTarget(page);
  await objective(page, "Deliver it to the stadium gate, Wallajah Road");
  const timed = await snapshot(page);
  expect((timed as unknown as { mission: string }).mission).toBe("stadium-biryani");
  await goToTarget(page);
  await objective(page, "Last box to the scorers, Victoria Hostel Road");
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBe("beach-road-brawl");
  expect((await state(page)).money).toBe(39_095 + 1600);
});

test("stage 21: beat the gang robbing the riders on the beach road", async ({ page }) => {
  test.setTimeout(300_000);
  await startAt(page, "beach-road-brawl", 40_695);
  await page.evaluate(() => (window as unknown as Hooks).__cow.giveWeapon("pistol", 120));
  await goToTarget(page);
  await expect.poll(async () => (await state(page)).enemies.filter((e) => e.group === "brawl").length, { timeout: GAME_WAIT }).toBe(5);
  for (let round = 0; round < 80; round++) {
    const s = await state(page);
    if (s.objective === "Go to the beach road opposite the stadium") {
      await goToTarget(page);
      continue;
    }
    if (s.mission !== "beach-road-brawl") break;
    await heal(page);
    const enemy = s.enemies.filter((e) => e.group === "brawl" && e.health > 0)[0];
    if (!enemy) {
      await waitGameTime(page, 0.3);
      continue;
    }
    const toward = Math.atan2(s.x - enemy.x, s.z - enemy.z);
    let from = { x: enemy.x + Math.sin(toward) * 6, z: enemy.z + Math.cos(toward) * 6 };
    for (let k = 0; k < 8; k++) {
      const a = toward + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
      if ((await probe(page, enemy.x + Math.sin(a) * 0.7, enemy.z + Math.cos(a) * 0.7, Math.sin(a), Math.cos(a), 6)) === null) {
        from = { x: enemy.x + Math.sin(a) * 6, z: enemy.z + Math.cos(a) * 6 };
        break;
      }
    }
    await teleport(page, from.x, from.z, Math.atan2(-(enemy.x - from.x), -(enemy.z - from.z)));
    await holdButton(page, "Fire", 500);
  }
  await expect.poll(async () => (await state(page)).mission, { timeout: GAME_WAIT }).toBeNull();
  expect((await state(page)).money).toBe(40_695 + 3000);
});
