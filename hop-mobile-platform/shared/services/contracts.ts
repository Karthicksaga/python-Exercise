export type Point = { lat: number; lng: number; label: string };
export type Area = {
  id: string;
  name: string;
  state?: string;
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
};
export type RoutePoint = { lat: number; lng: number };
export type Ride = {
  id: string;
  version: number;
  created_at?: string;
  trip_type?: string;
  rental_hours?: number;
  trip_days?: number;
  round_trip?: boolean;
  passenger_name?: string;
  my_rating?: number;
  bids?: { id: string; amount_paise: number; driver_name: string }[];
  status: string;
  mine?: boolean;
  driving?: boolean;
  pickup_label: string;
  dropoff_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  fare_paise: number;
  payable_paise?: number;
  vehicle_category: string;
  payment_method: string;
  payment_status?: string;
  driver_name?: string;
  driver_upi?: string;
  vehicle_number?: string;
  pickup_code?: string;
  driver_lat?: number;
  driver_lng?: number;
  route?: RoutePoint[];
  /** Captain offers: "next" is a ride offered to start after the captain's current drop-off. */
  offer_kind?: "now" | "next";
  /** When this captain's exclusive window to accept ends. */
  offer_expires_at?: string;
  /** Captain: they accepted this as their next ride; it becomes theirs when they complete their trip. */
  next_ride_held?: boolean;
  /** Rider: the ride is held for a captain finishing a nearby trip. */
  next_ride?: boolean;
  next_ride_eta_seconds?: number;
  reserved_driver_name?: string;
  /** Fare story (payment page): the quoted price, waiting charge, early-finish adjustment and distance. */
  quoted_fare_paise?: number;
  wait_charge_paise?: number;
  adjusted_from_paise?: number | null;
  covered_meters?: number | null;
  discount_paise?: number;
  meters?: number;
  seconds?: number;
  /** When the captain marked "arrived"; both apps count the free wait from here. */
  arrived_at?: string | null;
  /** Hop originals (phases 2–3): notes for the captain, arrival text and SMS trip updates. */
  rider_notes?: string[];
  arrival_alert?: boolean;
  arrival_alert_status?: "sent" | "test" | "unavailable" | "no_contact" | "failed" | null;
  sms_updates?: boolean;
};
export type State = {
  saved_locations?: (Point & { kind: string; place_label: string })[];
  rides: Ride[];
  offers: Ride[];
  driver: {
    online: boolean;
    status: string;
    area_id?: string;
    state?: string;
    review_note?: string;
    license_expires?: string;
    insurance_expires?: string;
    lat?: number;
    lng?: number;
  }[];
};
export type Config = {
  areas: Area[];
  vehicles: { area_id: string; category: string; name: string }[];
  development: boolean;
  routing_configured: boolean;
  phone_login: boolean;
  /** Texts (arrival alert, SMS updates): a provider is set up, or only logged in test mode. */
  sms_available?: boolean;
  sms_test_mode?: boolean;
  /** Chat translation (Google Cloud Translation) is configured. */
  translate_available?: boolean;
};
export type Quote = {
  payable_paise?: number;
  shared_fare_paise?: number;
  id: string;
  fare_paise: number;
  discount_paise?: number;
  route?: RoutePoint[];
  meters: number;
  seconds: number;
};

export type ScheduledRide = {
  id: string;
  category: string;
  pickup_label: string;
  dropoff_label: string;
  scheduled_for: string;
  status: string;
};
