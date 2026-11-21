/** The look: time of day and weather from the pause menu, remembered across a reload, no page errors. */
import { expect, test, type Page } from "@playwright/test";
import { holdStick, ready, snapshot } from "./support";

interface LookSnapshot {
  hour: number;
  weather: "clear" | "rain";
  paused: boolean;
  drawCalls: number;
}
const lookState = (page: Page) => snapshot(page) as unknown as Promise<LookSnapshot>;

test("starts at golden hour in clear weather", async ({ page }) => {
  await ready(page);
  const s = await lookState(page);
  expect(s.hour).toBeGreaterThan(17.7);
  expect(s.hour).toBeLessThan(17.9);
  expect(s.weather).toBe("clear");
});

test("night and rain from the pause menu, kept after a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await expect(page.getByRole("dialog")).toContainText("Paused");

  // Evening → Night.
  await page.getByRole("button", { name: /^Time: Evening/ }).click();
  await expect(page.getByRole("button", { name: /^Time: Night/ })).toBeVisible();
  expect((await lookState(page)).hour).toBeCloseTo(21.5, 1);

  await page.getByRole("button", { name: "Weather: Clear", exact: true }).click();
  await expect(page.getByRole("button", { name: "Weather: Rain", exact: true })).toBeVisible();
  expect((await lookState(page)).weather).toBe("rain");
  expect((await lookState(page)).paused).toBe(true);

  // Play a little at night in the rain: the rain streaks are one draw call, so the budget holds.
  await page.getByRole("button", { name: "Resume", exact: true }).tap();
  await holdStick(page, 0, -80, 800);
  const playing = await lookState(page);
  expect(playing.paused).toBe(false);
  expect(playing.drawCalls).toBeLessThan(450);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const reloaded = await lookState(page);
  expect(reloaded.weather).toBe("rain");
  expect(reloaded.hour).toBeGreaterThan(21);

  // And back to clear.
  await page.getByRole("button", { name: "Pause", exact: true }).tap();
  await page.getByRole("button", { name: "Weather: Rain", exact: true }).click();
  expect((await lookState(page)).weather).toBe("clear");
  expect(errors).toEqual([]);
});
