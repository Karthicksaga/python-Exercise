/**
 * Tells the Android shell how loading is going, so the shell can say so in its own native view
 * when the page itself cannot be seen (23 Nov 2026: on one phone the page stopped being drawn
 * part-way through loading, and nothing on screen said why). In a desktop browser there is no
 * shell and nothing is sent.
 *
 * - `device`: what the phone reports (memory class, cores, screen, GPU), once at the start.
 * - `loading`: each step as it starts, with seconds since the page opened.
 * - `alive`: every 2 s until loading ends. If these stop, the page's script is stuck; if they
 *   keep coming while the screen is frozen, the drawing is what failed.
 * - `problem`: script errors, and the 3D view (WebGL context) being lost.
 */
import { insideShell, sendToShell } from "./nativeBridge";

const HEARTBEAT_MS = 2000;

/** The GPU as WebGL names it, from a throwaway 1×1 context that is released at once. */
function gpuName(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "no WebGL";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch (error) {
    return `WebGL failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const seconds = () => Math.round(performance.now() / 100) / 10;

/** JS heap in use, MB, where the browser reports it (Chrome and the Android WebView do). */
const heapMB = (): number | undefined => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1048576) : undefined;
};

export interface LoadReport {
  step(id: string, label: string): void;
  /** Loading finished (the title menu or the game is showing): heartbeats stop. */
  done(): void;
}

export function startLoadReport(view: HTMLCanvasElement): LoadReport {
  if (!insideShell()) return { step: () => undefined, done: () => undefined };
  const nav = navigator as Navigator & { deviceMemory?: number };
  sendToShell({
    type: "device",
    memoryGB: nav.deviceMemory ?? null,
    cores: nav.hardwareConcurrency ?? null,
    screen: `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio}x`,
    gpu: gpuName(),
  });
  const timer = window.setInterval(() => sendToShell({ type: "alive", at: seconds(), heapMB: heapMB() ?? null }), HEARTBEAT_MS);
  const problem = (message: string) => sendToShell({ type: "problem", at: seconds(), message: message.slice(0, 300) });
  window.addEventListener("error", (event) => problem(event.message || "Script error"));
  window.addEventListener("unhandledrejection", (event) => problem(`Unhandled: ${event.reason instanceof Error ? event.reason.message : String(event.reason)}`));
  // Kept for the whole session: losing the 3D view after loading is just as worth knowing.
  view.addEventListener("webglcontextlost", () => problem("The 3D view was lost (WebGL context lost): the GPU ran out of memory or was reset."));
  return {
    step: (id, label) => sendToShell({ type: "loading", step: id, label, at: seconds() }),
    done: () => {
      window.clearInterval(timer);
      sendToShell({ type: "loaded", at: seconds() });
    },
  };
}
