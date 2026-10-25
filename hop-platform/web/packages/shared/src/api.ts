let csrf = "";
let accountID = "";
export function setCSRF(value: string) {
  csrf = value;
  if (!value) accountID = "";
}
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const send = () => fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  let response = await send();
  let data = await response.json();
  if (response.ok && path === "/api/me") {
    accountID = data.user.id;
    csrf = data.csrf;
  }
  // Another tab may rotate the shared session cookie while this tab retains its old token.
  // The rejected request has not run; retry once only for the same signed-in account.
  if (body !== undefined && accountID && response.status === 403 &&
      data.error === "Request origin or CSRF token is invalid") {
    const me = await fetch("/api/me", { credentials: "same-origin", signal });
    if (me.ok) {
      const session = await me.json();
      if (session.user.id !== accountID) {
        throw new APIError("Your signed-in account changed. Reload the page before continuing.", 403);
      }
      if (session.csrf && session.csrf !== csrf) {
        csrf = session.csrf;
        response = await send();
        data = await response.json();
      }
    }
  }
  if (!response.ok)
    throw new APIError(data.error || "Request failed", response.status);
  return data;
}
