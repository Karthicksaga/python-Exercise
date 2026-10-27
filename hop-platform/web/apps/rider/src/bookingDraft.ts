import type { Point } from "@hop/shared/types";
import type { TripValue } from "./TripOptions";
export type BookingDraft = {
  area: string;
  pickup: Point | null;
  dropoff: Point | null;
  vehicleCategory: string;
  trip: TripValue;
  step: "where" | "choose" | "confirm";
  instructions: string;
};
const key = (owner: string) => `hop.rider.booking.v1.${owner}`;
const point = (p: any): p is Point =>
  p &&
  Number.isFinite(p.lat) &&
  Math.abs(p.lat) <= 90 &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lng) <= 180 &&
  typeof p.label === "string" &&
  p.label.length <= 1000;
export function readDraft(owner: string): BookingDraft | null {
  try {
    const raw = sessionStorage.getItem(key(owner));
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (
      Date.now() - d.savedAt > 2 * 3600e3 ||
      d.savedAt > Date.now() ||
      !Number.isFinite(d.savedAt) ||
      typeof d.area !== "string" ||
      typeof d.vehicleCategory !== "string" ||
      !["where", "choose", "confirm"].includes(d.step) ||
      (d.pickup !== null && !point(d.pickup)) ||
      (d.dropoff !== null && !point(d.dropoff)) ||
      !d.trip ||
      !["city", "rental", "outstation"].includes(d.trip.trip_type) ||
      !Array.isArray(d.trip.stops) ||
      d.trip.stops.length > 3 ||
      !d.trip.stops.every(point) ||
      !Number.isInteger(d.trip.rental_hours) ||
      d.trip.rental_hours < 1 ||
      d.trip.rental_hours > 12 ||
      !Number.isInteger(d.trip.trip_days) ||
      d.trip.trip_days < 1 ||
      d.trip.trip_days > 10 ||
      typeof d.trip.round_trip !== "boolean" ||
      typeof d.instructions !== "string" ||
      d.instructions.length > 250
    ) {
      clearDraft(owner);
      return null;
    }
    return d;
  } catch {
    clearDraft(owner);
    return null;
  }
}
export function saveDraft(owner: string, draft: BookingDraft) {
  try {
    sessionStorage.setItem(
      key(owner),
      JSON.stringify({ ...draft, savedAt: Date.now() }),
    );
  } catch {
    /* Booking remains usable when storage is unavailable. */
  }
}
export function clearDraft(owner: string) {
  try {
    sessionStorage.removeItem(key(owner));
  } catch {}
}
export type PendingBooking = {
  quote_id: string;
  request_key: string;
  payment_method: "cash" | "upi" | "wallet";
  offer_paise?: number;
  pickup_instructions?: string;
  share?: boolean;
  family_member_id?: string;
  passenger_name?: string;
  passenger_phone?: string;
  favorite_first?: boolean;
  circle?: boolean;
  circle_captain_id?: string;
};
export function writePending(owner: string, attempt: PendingBooking | null) {
  try {
    const k = key(owner) + ".pending";
    if (attempt)
      sessionStorage.setItem(
        k,
        JSON.stringify({ attempt, savedAt: Date.now() }),
      );
    else sessionStorage.removeItem(k);
  } catch {}
}
export function readPending(owner: string): PendingBooking | null {
  try {
    const d = JSON.parse(
      sessionStorage.getItem(key(owner) + ".pending") || "null",
    );
    if (
      d &&
      Date.now() - d.savedAt < 2 * 3600e3 &&
      d.savedAt <= Date.now() &&
      typeof d.attempt?.request_key === "string" &&
      typeof d.attempt?.quote_id === "string" &&
      ["cash", "upi", "wallet"].includes(d.attempt.payment_method)
    )
      return d.attempt;
  } catch {}
  writePending(owner, null);
  return null;
}
