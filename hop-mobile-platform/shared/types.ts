export type Role = "rider" | "captain";

export type VehicleCategory = "auto" | "bike" | "mini" | "sedan" | "suv";

export interface VehicleOption {
  id: VehicleCategory;
  name: string;
  caption: string;
  price: number;
  eta: string;
  seats: number;
}

export interface Place {
  name: string;
  detail: string;
  icon: string;
  lat?: number;
  lng?: number;
}

export type TripPhase =
  | "none"
  | "requested"
  | "matching"
  | "accepted"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface RideQuote {
  id?: string;
  category: VehicleCategory;
  price: number;
  originalPrice?: number;
  discount?: number;
  eta: string;
  durationMin: number;
  distanceKm: number;
  currency: string;
}

export interface DriverOffer {
  id: string;
  rider: string;
  rating: string;
  pickup: string;
  dest: string;
  dist: string;
  time: string;
  tripKm: string;
  price: number;
  vehicle: string;
  payment: string;
  corridor: string;
}

export interface ChatMessage {
  id?: string;
  sender: "mine" | "partner" | "system";
  text: string;
  time?: string;
}

export interface CommuteCorridor {
  id: string;
  corridor: "omr" | "guindy" | "ambattur";
  name: string;
  sub: string;
  time: string;
  days: string;
  captain: string;
  rating: string;
  trips: string;
  car: string;
  seatsTotal: number;
  seatsLeft: number;
  price: number;
  badge: string;
}

export interface EarningsPeriodData {
  amount: string;
  trips: string;
  km: string;
  cash: string;
  online: string;
  bars: number[];
  labels: string[];
  legend: string;
}

