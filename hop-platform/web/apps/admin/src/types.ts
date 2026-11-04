// Response shapes of the operator and admin endpoints (see hop-platform/docs/API.md).
import type { Area } from "@hop/shared/types";

export type Summary = {
  sos_active: number; incidents_open: number; drivers_pending: number; oldest_pending_at: string | null; changes_pending: number;
  expiring_7d: number; payouts_requested: number; payouts_requested_paise: number; lost_open: number; active_rides: number;
};
export type SummaryArea = { id: string; name: string; state: string; active: boolean; categories: string[]; captains_online: number; surge_multiplier: number | null; surge_reason: string | null };

// A zone as /api/operator returns it (SELECT * FROM areas).
export type ZoneArea = {
  id: string; name: string; state: string; min_lat: number; max_lat: number; min_lng: number; max_lng: number;
  base_paise: number; per_km_paise: number; minimum_paise: number; active: boolean; approval_reference: string;
  catalog_id?: string | null; pricing_version?: number; surge_cap?: number; surge_auto?: boolean;
};
export type Region = {
  id: string; state: string; district: string; min_lat: number; max_lat: number; min_lng: number; max_lng: number; source: string;
  city: string | null; city_source: "boundary" | "approx" | null; city_min_lat: number | null; city_max_lat: number | null; city_min_lng: number | null; city_max_lng: number | null;
  area_id: string | null; area_name: string | null; area_active: boolean;
};
export type Pricing = { area_id: string; category: string; base_paise: number; per_km_paise: number; minimum_paise: number; pricing_version: number; enabled: boolean };
export type VehicleChange = { id: string; driver_id: string; name: string; current_category: string; current_number: string; vehicle_category: string; vehicle_number: string; created_at: string };
export type AreaChange = { id: string; driver_id: string; name: string; current_area_name: string; current_area_state: string; requested_area_name: string; requested_area_state: string; created_at: string };
export type Incident = { id: string; ride_id: string; reporter_id: string; message: string; status: string; resolution: string; created_at: string };
export type AuditEvent = { id: number; actor_id: string | null; ride_id: string | null; action: string; detail: unknown; created_at: string };
export type Operations = {
  areas: ZoneArea[]; pricing: Pricing[]; vehicle_changes: VehicleChange[]; area_changes: AreaChange[]; incidents: Incident[]; events: AuditEvent[];
};

export type RideRecord = {
  id: string; status: string; payment_method: string; payment_status: string; created_at: string; rider: string; driver: string;
  pickup_label: string; dropoff_label: string; fare_paise: number; discount_paise: number; payable_paise: number; refunded_paise: number;
};
export type LiveDriver = { user_id: string; name: string; email: string; vehicle_category: string; vehicle_number: string; online: boolean; status: string; lat: number; lng: number; location_at: string | null };
export type ActiveRide = {
  id: string; status: string; payment_method: string; created_at: string; driver_id: string | null; rider_name: string; driver_name: string;
  vehicle_category: string; vehicle_number: string; pickup_label: string; dropoff_label: string; pickup_lat: number; pickup_lng: number;
  dropoff_lat: number; dropoff_lng: number; driver_lat?: number; driver_lng?: number; fare_paise: number;
};
export type LiveData = { drivers: LiveDriver[]; active_rides: ActiveRide[]; areas: (Pick<Area, "id" | "name" | "state" | "min_lat" | "max_lat" | "min_lng" | "max_lng" | "active">)[] };

export type SOSEvent = {
  id: string; ride_id: string; lat: number; lng: number; created_at: string; rider_name: string; rider_email: string; driver_name: string;
  vehicle_number: string; ride_status: string; pickup_label: string; dropoff_label: string; incident_status: string; incident_message: string; resolution: string;
};
export type DriverScore = { driver_id: string; name: string; score: number; label: string; cancellations: number; incidents: number; ratings?: number; rating_avg?: number; completed_trips: number };
export type LostItem = {
  id: string; ride_id: string; description: string; status: "open" | "driver_contacted" | "returned" | "closed"; created_at: string;
  rider_name: string; rider_email: string; driver_name: string; vehicle_number: string; pickup_label: string; dropoff_label: string; ride_date: string;
};
export type Finance = {
  totals: { driver_liability_paise: number; promo_funded_paise: number; refunded_paise: number; wallet_held_paise: number };
  promos: {
    code: string; description: string; kind: string; value: number; active: boolean; valid_to: string | null; redemptions: number; max_uses: number | null;
    max_discount_paise: number; min_fare_paise: number; per_user_limit: number; area_id: string | null; listed: boolean;
  }[];
  peak_windows: { id: string; area: string; label: string; days: number[]; start_time: string; end_time: string; multiplier: number }[];
  surges: { id: string; area: string; category: string | null; multiplier: number; reason: string; ends_at: string }[];
  payouts: { id: string; name: string; amount_paise: number; upi_id: string; status: string; reference: string; requested_at: string }[];
  refunds: { id: string; rider: string; amount_paise: number; reason: string; created_at: string }[];
  area_surge: { id: string; name: string; surge_cap: number; surge_auto: boolean }[];
  driver_safety: DriverScore[];
};
export type Analytics = {
  gmv_today_paise: number; gmv_all_time_paise: number; commission_all_time_paise: number; completed_rides: number; cancelled_rides: number;
  total_rides: number; active_drivers: number; total_drivers: number; total_riders: number;
  payments: { payment_method: string; count: number; total_paise: number }[];
  volume: { day: string; count: number; completed: number }[];
};
