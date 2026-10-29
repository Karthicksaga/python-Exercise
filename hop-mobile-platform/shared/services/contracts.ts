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
