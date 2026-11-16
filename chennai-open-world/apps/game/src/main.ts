import { Game, type GameSnapshot } from "./Game";
import { sendToShell } from "./nativeBridge";

declare global {
  interface Window {
    /** Debug and test handle; not used by gameplay code. */
    __cow?: {
      snapshot(): GameSnapshot;
      setPaused(paused: boolean): void;
      teleport(x: number, z: number, yaw?: number): Promise<void>;
      probe(x: number, z: number, dx: number, dz: number, max: number): number | null;
      /** Hold a pedestrian standing at a point until a vehicle hits them; false when nobody is free. */
      stagePedestrian(x: number, z: number, heading: number): boolean;
    };
  }
}

async function boot(): Promise<void> {
  const canvas = document.getElementById("view");
  const stage = document.getElementById("stage");
  const loading = document.getElementById("loading");
  if (!(canvas instanceof HTMLCanvasElement) || !stage || !loading) throw new Error("Game page is missing its canvas.");

  try {
    const game = await Game.create(canvas, stage);
    window.__cow = {
      snapshot: () => game.snapshot(),
      setPaused: (paused) => game.setPaused(paused),
      // For tests and debugging only: missions need long drives that tests skip with this.
      teleport: (x, z, yaw) => game.teleport(x, z, yaw),
      probe: (x, z, dx, dz, max) => game.probe(x, z, dx, dz, max),
      stagePedestrian: (x, z, heading) => game.stagePedestrian(x, z, heading),
    };
    game.start();
    loading.remove();
    document.documentElement.dataset.ready = "true";
  } catch (error) {
    // Never leave a black screen: say what failed (usually no WebGL on the device).
    const message = error instanceof Error ? error.message : String(error);
    loading.textContent = `The game could not start on this device. ${message}`;
    loading.setAttribute("role", "alert");
    document.documentElement.dataset.ready = "error";
    sendToShell({ type: "error", message });
  }
}

void boot();
