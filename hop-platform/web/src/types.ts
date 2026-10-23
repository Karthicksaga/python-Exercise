export type Point = { lat: number; lng: number; label: string };
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
export type User = {
  id: string;
  name: string;
  email: string;
  role: "rider" | "operator";
};
export type Quote = {
  id: string;
  meters: number;
  seconds: number;
  fare_paise: number;
  expires_at: string;
  commission_paise: number;
};
export type Ride = {
  id: string;
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
  mine?: boolean;
  driving?: boolean;
  pickup_code?: string;
  payment_method: "cash" | "upi";
  payment_status: string;
  driver_name?: string;
  vehicle_number?: string;
  driver_upi?: string;
  driver_lat?: number;
  driver_lng?: number;
  created_at: string;
  expires_at: string;
  rider_name?: string;
};
export type Driver = {
  user_id: string;
  area_id: string;
  status: string;
  vehicle_number: string;
  upi_id: string;
  review_note: string;
  online: boolean;
  location_at: string;
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
export type State = {
  rides: Ride[];
  driver: Driver[];
  offers: Ride[];
  incidents: Incident[];
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
