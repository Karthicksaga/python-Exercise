import { serverFetch } from "./platform";
let csrf = "";
let accountID = "";
export function getCSRF() { return csrf; }
export function setCSRF(value: string) {
  csrf = value;
  if (!value) accountID = "";
}
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
async function parseResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.length < 200 ? text.trim() : `Server returned ${res.status} ${res.statusText || ""}`.trim() };
  }
}

export function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

export function subscribeOnlineStatus(cb: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => cb(true);
  const onOffline = () => cb(false);
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
  };
}

export type ApiOptions = {
  retries?: number;
  timeoutMs?: number;
};

export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  options?: ApiOptions,
): Promise<T> {
  const maxRetries = options?.retries ?? (body === undefined ? 2 : 0);
  let attempt = 0;

  const send = () =>
    serverFetch(path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });

  while (true) {
    try {
      let response = await send();
      let data = await parseResponse(response);
      if (response.ok && path === "/api/me") {
        accountID = data.user?.id || "";
        csrf = data.csrf || "";
      }
      // Another tab may rotate the shared session cookie while this tab retains its old token.
      // The rejected request has not run; retry once only for the same signed-in account.
      if (
        body !== undefined &&
        accountID &&
        response.status === 403 &&
        data.error === "Request origin or CSRF token is invalid"
      ) {
        const me = await serverFetch("/api/me", { credentials: "same-origin", signal });
        if (me.ok) {
          const session = await parseResponse(me);
          if (session.user && session.user.id !== accountID) {
            throw new APIError("Your signed-in account changed. Reload the page before continuing.", 403);
          }
          if (session.csrf && session.csrf !== csrf) {
            csrf = session.csrf;
            response = await send();
            data = await parseResponse(response);
          }
        }
      }

      // Retry on 502, 503, 504 server unavailable errors if attempts remain
      if (!response.ok && [502, 503, 504].includes(response.status) && attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 3000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      if (!response.ok) {
        throw new APIError(data.error || `Request failed (${response.status})`, response.status, data.code);
      }
      return data;
    } catch (err) {
      if (err instanceof APIError) {
        throw err;
      }
      // Network error or aborted
      if (signal?.aborted) {
        throw err;
      }
      if (attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 200, 3000);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw new APIError(
        (err as Error).message || "Network request failed. Please check your connection and try again.",
        0,
        "network_error"
      );
    }
  }
}
