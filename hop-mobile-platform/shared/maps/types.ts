export type Coordinate = {
  lat: number;
  lng: number;
  heading?: number;
};
export type Vehicle = Coordinate & {
  id: string;
  category: string;
};
export type MapData = {
  center: Coordinate;
  vehicles: Vehicle[];
  current?: Coordinate;
  pickup?: Coordinate;
  dropoff?: Coordinate;
  route?: Coordinate[];
  following?: boolean;
  editable?: boolean;
  /** Ride status while a trip is live (accepted, arrived, in_progress). */
  phase?: string;
  /** The route is the captain's road route to the pickup, so the captain is drawn on it. */
  approach?: boolean;
  /** Every drivable route in backend order. Unselected ones are drawn in grey; tapping one picks it. */
  alternatives?: AlternativeRoute[];
  /** Short real values shown in the pin callouts, e.g. "Captain 3 min", "Arrive 6:42 PM". */
  pickupNote?: string;
  dropoffNote?: string;
};
export type AlternativeRoute = { index: number; route: Coordinate[]; label: string; selected: boolean };
export type MapPreferences = { traffic: boolean; satellite: boolean; lowdata: boolean; night: boolean };
export interface MapView {
  setPreferences(preferences: MapPreferences): void;
  update(data: MapData): void;
  center(point: Coordinate): void;
  fit(points: Coordinate[]): void;
  camera(): { center: Coordinate; zoom: number };
  restore(camera: { center: Coordinate; zoom: number }): void;
  setRouteProgress?(points: Coordinate[]): void;
  /** The route preview's travelling vehicle, drawn as the rider's chosen category (bike, auto…). */
  setPreviewVehicle?(position: Coordinate | null, heading?: number, category?: string): void;
  pulseDestination?(active: boolean): void;
  setAlternatives?(routes: AlternativeRoute[]): void;
  /** 3D (MapLibre map only): tilt now, or flatten and stay flat. */
  setThreeD?(on: boolean): void;
  isTilted?(): boolean;
  /** Shade outside Hop's service areas (zone rectangles from /api/config). */
  setServiceAreas?(areas: { min_lat: number; max_lat: number; min_lng: number; max_lng: number }[]): void;
  /** Captain demand glow from /api/drivers/demand. */
  setDemand?(cells: { lat: number; lng: number; requests: number; drivers?: number }[]): void;
  destroy(): void;
}
export const validCoordinate = (p: Coordinate) =>
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  p.lat >= -90 &&
  p.lat <= 90 &&
  p.lng >= -180 &&
  p.lng <= 180;
export const vehicleCategory = (value: string) =>
  ["auto", "bike", "mini", "sedan", "suv"].includes(value) ? value : "auto";
