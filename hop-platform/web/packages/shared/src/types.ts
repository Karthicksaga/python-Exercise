export type Point = { lat: number; lng: number; label: string };
export type RoutePoint = { lat: number; lng: number };
export type Area = {
  id: string;
  name: string;
  state: string;
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  base_paise?: number;
  per_km_paise?: number;
  minimum_paise?: number;
  active?: boolean;
  approval_reference?: string;
};
export type VehiclePricing = {
  area_id: string;
  category: string;
  name: string;
  base_paise: number;
  per_km_paise: number;
  minimum_paise: number;
  pricing_version: number;
  stop_fee_paise: number;
  hourly_paise: number | null;
  included_km_per_hour: number;
  extra_km_paise: number;
  outstation_per_km_paise: number | null;
  outstation_allowance_paise: number;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: "rider" | "operator";
};
export type SavedLocation = {
  id: string;
  label: string;
  kind: "home" | "work" | "favorite";
  lat: number;
  lng: number;
  place_label: string;
};
export type PayMethod = "cash" | "upi" | "wallet";
export type TripType = "city" | "rental" | "outstation";
export type Quote = {
  id: string;
  meters: number;
  seconds: number;
  fare_paise: number;
  expires_at: string;
  commission_paise: number;
  vehicle_category: string;
  vehicle_name: string;
  fare_breakdown: {
    base_paise: number;
    distance_paise: number;
    minimum_adjustment_paise: number;
    platform_fee_paise: number;
    total_paise: number;
    stops_paise?: number;
    hourly_paise?: number;
    hours?: number;
    included_km?: number;
    driver_allowance_paise?: number;
    days?: number;
    surge_paise?: number;
    surge_percent?: number;
    discount_paise?: number;
  };
  trip_type?: TripType;
  route: RoutePoint[];
  surge_multiplier?: number;
  surge_reason?: string;
  promo_code?: string;
  discount_paise?: number;
  payable_paise?: number;
  shared_fare_paise?: number;
  shared_payable_paise?: number;
  shared_discount_percent?: number;
  share_wait_seconds?: number;
};
export type Ride = {
  id: string;
  wait_charge_paise?: number;
  group_id?: string | null;
  group_leader?: boolean;
  share_state?: "none" | "waiting" | "matched" | "solo_shared" | "solo_full";
  share_until?: string | null;
  co_rider?: { name: string; status: string };
  stop_plan?: { ride_id: string; kind: "pickup" | "drop"; label: string; rider: string }[];
  status: string;
  version: number;
  pickup_label: string;
  dropoff_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  meters: number;
  seconds: number;
  fare_paise: number;
  vehicle_category: string;
  mine?: boolean;
  driving?: boolean;
  pickup_code?: string;
  payment_method: PayMethod;
  payment_status: string;
  discount_paise?: number;
  surge_multiplier?: number;
  promo_code?: string | null;
  payable_paise?: number;
  full_fare_status?: "none" | "requested" | "approved" | "declined";
  adjusted_from_paise?: number | null;
  covered_meters?: number | null;
  driver_name?: string;
  driver_id?: string;
  driver_has_photo?: boolean;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  vehicle_number?: string;
  driver_upi?: string;
  driver_lat?: number;
  driver_lng?: number;
  eta_seconds?: number;
  eta_meters?: number;
  eta_target?: "pickup" | "destination";
  eta_at?: string;
  notified_drivers?: number;
  route?: RoutePoint[];
  created_at: string;
  expires_at: string;
  rider_name?: string;
  trip_type?: TripType;
  stops?: Point[];
  rental_hours?: number | null;
  trip_days?: number | null;
  round_trip?: boolean;
  negotiated?: boolean;
  quoted_fare_paise?: number;
  my_bid_paise?: number | null;
  bids?: { id: string; amount_paise: number; driver_name: string; vehicle_number: string }[];
  reserved_driver_name?: string;
  reserved_until?: string;
  passenger_name?: string;
  passenger_phone?: string;
  my_rating?: number | null;
  my_rating_comment?: string;
  driver_rating?: number | null;
  driver_rating_count?: number;
  driver_trips?: number;
  search_radius_m?: number;
  dispatch_stage?: number;
};
export type Estimate = { meters: number; seconds: number; route: RoutePoint[]; options: { category: string; name: string; fare_paise: number; tag?: string; surge_multiplier?: number; surge_reason?: string }[] };
export type ChatMessage = { id: number; body: string; mine: boolean; created_at: string };
export type Driver = {
  user_id: string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_color?: string;
  onboarding_version?: number;
  area_id: string;
  status: string;
  vehicle_number: string;
  vehicle_category: string;
  upi_id: string;
  review_note: string;
  online: boolean;
  lat?: number | null;
  lng?: number | null;
  location_at: string;
  pickup_radius_meters: number;
  minimum_fare_paise: number;
  home_until?: string | null;
  home_uses?: number;
  home_uses_on?: string | null;
  daily_goal_paise?: number;
  name?: string;
  email?: string;
  license_reference?: string;
  insurance_reference?: string;
  license_expires: string;
  insurance_expires: string;
};
export type Incident = {
  id: string;
  ride_id: string;
  message: string;
  status: string;
  resolution: string;
};
export type VehicleChange = {
  id: string;
  vehicle_category: string;
  vehicle_number: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string;
  created_at: string;
};
export type AreaChange = {
  id: string;
  area_id: string;
  area_name?: string;
  area_state?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note: string;
  created_at: string;
};
export type NearbyDriver = { id?: string; category: string; lat: number; lng: number };
export type Nearby = { category: string; drivers: number; eta_minutes: number };
export type State = {
  vehicle_change?: VehicleChange[];
  area_change?: AreaChange[];
  rides: Ride[];
  driver: Driver[];
  offers: Ride[];
  incidents: Incident[];
  saved_locations: SavedLocation[];
};
export const active = (r: Ride) =>
  ["requested", "accepted", "arrived", "in_progress"].includes(r.status);
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const statuses: Record<string, string> = {
  requested: "Finding your driver",
  accepted: "Driver on the way",
  arrived: "Meet at pickup",
  in_progress: "On your way",
  completed: "Ride complete",
  cancelled: "Cancelled",
  expired: "No driver accepted",
};
