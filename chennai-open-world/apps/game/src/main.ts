import type { WeaponId } from "@cow/combat";
import { renderVehicleSound, type VehicleSoundKind } from "@cow/audio";
import { LoadingScreen } from "@cow/ui";
import { STATION_FONT } from "@cow/game-engine";
import { Game, LOAD_STEPS, type GameSnapshot } from "./Game";
import { sendToShell } from "./nativeBridge";

/** Shown one at a time while the city loads. Every tip describes something the game really does. */
const TIPS: readonly string[] = [
  "On foot, the left side of the screen moves you and the right side looks around.",
  "Driving: steer with the left stick; GAS and BRAKE are on the right. Hold BRAKE to reverse.",
  "JOBS opens the job board. City jobs pay, and doing them well builds your reputation.",
  "Tap the minimap to open the full city map.",
  "Suburban trains run to a timetable. Board at a platform when a train is standing there: a ticket is ₹5.",
  "No new jobs while the police are after you. Lose them first.",
  "Pause to change the time of day or bring in the rain.",
  "The streets are real: they come from OpenStreetMap, from Anna Nagar to the Marina.",
  "The ambulance has a SIREN button where other vehicles have a horn.",
  "Places you can go into have a marker at their entrance: walk up and press ENTER.",
];

/**
 * `?start=play` skips the title menu and starts at once. The browser tests use it, and so does
 * the Android smoke-test build (which must reach a running game with no taps); players never do.
 */
const startAtOnce = (): boolean => new URLSearchParams(location.search).get("start") === "play";

declare global {
  interface Window {
    /** Debug and test handle; not used by gameplay code. */
    __cow?: {
      snapshot(): GameSnapshot;
      setPaused(paused: boolean): void;
      teleport(x: number, z: number, yaw?: number): Promise<void>;
      probe(x: number, z: number, dx: number, dz: number, max: number): number | null;
      /** Tests only: move the railway clock forward by this many seconds. */
      railAdvance(seconds: number): void;
      /** Tests only: set the player's health (to check that treatment and rest restore it). */
      setHealth(health: number): void;
      /** Hold a pedestrian standing at a point until a vehicle hits them; false when nobody is free. */
      stagePedestrian(x: number, z: number, heading: number): boolean;
      /** Tests only: set the wanted level (0 to 5 stars), e.g. to look at a three-star chase. */
      setWanted(stars: number): void;
      /** Tests only: give the player this many pistol rounds (to fire in the street). */
      giveAmmo(rounds: number): void;
      /** Tests only: give a weapon with rounds and take it in hand (skips finding a pickup). */
      giveWeapon(id: WeaponId, ammo: number): void;
      /** Tests only: render a vehicle's engine or horn offline and return the samples (22.05 kHz). */
      renderSound(what: "engine" | "horn", kind: VehicleSoundKind, options?: { speed?: number; throttle?: number; seconds?: number }): Promise<number[]>;
    };
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("view");
  const stage = document.getElementById("stage");
  const loading = document.getElementById("loading");
  if (!(canvas instanceof HTMLCanvasElement) || !stage || !loading) throw new Error("Game page is missing its canvas.");

  const screen = new LoadingScreen(loading, { steps: LOAD_STEPS, tips: TIPS, tamilFont: STATION_FONT });
  try {
    const game = await Game.create(canvas, stage, {
      step: (id) => screen.step(id),
      world: (map) => screen.sketch(map),
    });
    window.__cow = {
      snapshot: () => game.snapshot(),
      setPaused: (paused) => game.setPaused(paused),
      // For tests and debugging only: missions need long drives that tests skip with this.
      teleport: (x, z, yaw) => game.teleport(x, z, yaw),
      probe: (x, z, dx, dz, max) => game.probe(x, z, dx, dz, max),
      // For tests only: trains run on a timetable; a test skips the wait for the next one.
      railAdvance: (seconds) => game.railway?.advance(seconds),
      setHealth: (health) => game.debugSetHealth(health),
      stagePedestrian: (x, z, heading) => game.stagePedestrian(x, z, heading),
      // For tests only (police.spec.ts): jump to a wanted level, and have rounds to fire.
      setWanted: (stars) => game.debugSetWanted(stars),
      giveAmmo: (rounds) => game.debugGiveAmmo(rounds),
      // For tests only: the later stages need guns the player would have found by then.
      giveWeapon: (id, ammo) => game.debugGiveWeapon(id, ammo),
      // For tests only (sound.spec.ts): hear what each vehicle's engine and horn are made of.
      renderSound: async (what, kind, options) => Array.from(await renderVehicleSound(what, kind, options)),
    };
    if (startAtOnce()) {
      game.start();
      document.documentElement.dataset.ready = "true";
    } else {
      // The title menu over the live city; the loading screen fades out on top of it.
      void game.showTitle();
      document.documentElement.dataset.ready = "title";
    }
    await screen.finish();
  } catch (error) {
    // Never leave a black screen: say what failed (usually no WebGL on the device).
    const message = error instanceof Error ? error.message : String(error);
    screen.fail(message, () => location.reload());
    document.documentElement.dataset.ready = "error";
    sendToShell({ type: "error", message });
  }
}

void boot();
