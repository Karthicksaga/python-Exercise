/**
 * Messages between the game (inside a WebView) and the React Native shell.
 * In a desktop browser there is no shell and every call is a no-op.
 */
export type GameMessage =
  | { type: "ready"; gpu: string }
  | { type: "error"; message: string }
  | { type: "paused"; paused: boolean }
  | { type: "exit" };

export type ShellMessage = { type: "pause" } | { type: "resume" };

interface ReactNativeWebView {
  postMessage(data: string): void;
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebView;
  }
}

export const insideShell = (): boolean => typeof window.ReactNativeWebView !== "undefined";

export function sendToShell(message: GameMessage): void {
  window.ReactNativeWebView?.postMessage(JSON.stringify(message));
}

/** The shell delivers messages by dispatching a `cow-shell` event with a JSON string detail. */
export function onShellMessage(handler: (message: ShellMessage) => void): void {
  window.addEventListener("cow-shell", (event) => {
    try {
      const data = JSON.parse(String((event as CustomEvent<string>).detail)) as ShellMessage;
      if (data.type === "pause" || data.type === "resume") handler(data);
    } catch {
      // Ignore anything that isn't one of our messages.
    }
  });
}
