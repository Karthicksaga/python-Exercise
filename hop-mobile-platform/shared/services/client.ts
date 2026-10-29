import { transport } from "../platform/transport";
import type { Config, Point, Quote, State } from "./contracts";
export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export class HopAPI {
  private csrf = "";
  constructor(private send: typeof transport = transport) {}
  async request<T>(path: string, body?: unknown): Promise<T> {
    const response = await this.send(path, {
      method: body === undefined ? "GET" : "POST",
      signal: AbortSignal.timeout(12000),
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": this.csrf },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new APIError(
        "Backend returned an unreadable response.",
        response.status,
      );
    }
    if (!response.ok)
      throw new APIError(
        data.error || `Request failed (${response.status})`,
        response.status,
      );
    if (data.csrf) this.csrf = data.csrf;
    return data as T;
  }
  config() {
    return this.request<Config>("/api/config");
  }
  session() {
    return this.request<{ user: { id: string; name: string }; csrf: string }>(
      "/api/me",
    );
  }
  state() {
    return this.request<State>("/api/state");
  }
  requestOtp(phone: string) {
    return this.request<{ ok: boolean; dev_code?: string }>(
      "/auth/otp/request",
      { phone },
    );
  }
  async verifyOtp(phone: string, code: string) {
    await this.request("/auth/otp/verify", { phone, code });
    return this.session();
  }
  quote(
    area_id: string,
    vehicle_category: string,
    pickup: Point,
    dropoff: Point,
    options: Record<string, unknown> = {},
  ) {
    return this.request<Quote>("/api/quotes", {
      area_id,
      vehicle_category,
      pickup,
      dropoff,
      ...options,
    });
  }
  bookRide(
    quote_id: string,
    request_key: string,
    payment_method: string,
    options: Record<string, unknown> = {},
  ) {
    return this.request<{ id: string }>("/api/rides", {
      quote_id,
      request_key,
      payment_method,
      ...options,
    });
  }
  action(
    id: string,
    version: number,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    return this.request(`/api/rides/${encodeURIComponent(id)}/actions`, {
      action,
      version,
      ...extra,
    });
  }
  online(online: boolean) {
    return this.request(`/api/drivers/${online ? "online" : "offline"}`, {});
  }
  location(lat: number, lng: number, accuracy: number) {
    return this.request("/api/drivers/location", { lat, lng, accuracy });
  }
  places(query: string) {
    return this.request<Point[]>(`/api/places?q=${encodeURIComponent(query)}`);
  }
}
export const api = new HopAPI();
