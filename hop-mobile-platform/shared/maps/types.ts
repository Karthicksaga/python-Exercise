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
};
export type MapPreferences = { traffic: boolean; satellite: boolean; lowdata: boolean; night: boolean };
export interface MapView {
  setPreferences(preferences: MapPreferences): void;
  update(data: MapData): void;
  center(point: Coordinate): void;
  fit(points: Coordinate[]): void;
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
