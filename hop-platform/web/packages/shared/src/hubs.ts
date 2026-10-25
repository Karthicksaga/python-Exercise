import type { Point } from "./types";

export type Hub = Point & { kind: "airport" | "rail"; note: string };

// Fixed pickup/drop bays at airports and major stations, keyed by area name.
export const hubs: Record<string, Hub[]> = {
  Chennai: [
    { kind: "airport", label: "Chennai International Airport (MAA), Departures", lat: 12.9941, lng: 80.1709, note: "Gate 4 · Departures forecourt" },
    { kind: "rail", label: "Chennai Central Railway Station, Pickup bay", lat: 13.0827, lng: 80.2755, note: "Cab bay, Poonamallee High Rd side" },
    { kind: "rail", label: "Chennai Egmore Railway Station", lat: 13.0788, lng: 80.2609, note: "Main entrance cab stand" },
    { kind: "rail", label: "Tambaram Railway Station", lat: 12.9249, lng: 80.1196, note: "East side auto & cab stand" },
  ],
  Bengaluru: [
    { kind: "airport", label: "Kempegowda International Airport (BLR), Departures", lat: 13.1986, lng: 77.7066, note: "Terminal 1 cab pickup" },
    { kind: "rail", label: "KSR Bengaluru City Railway Station", lat: 12.9783, lng: 77.5712, note: "Platform 1 side cab bay" },
    { kind: "rail", label: "Yesvantpur Junction Railway Station", lat: 13.0235, lng: 77.5503, note: "Main entrance cab stand" },
  ],
  Mumbai: [
    { kind: "airport", label: "Chhatrapati Shivaji Maharaj International Airport (BOM)", lat: 19.0896, lng: 72.8656, note: "Terminal 2 departures" },
    { kind: "rail", label: "Chhatrapati Shivaji Maharaj Terminus", lat: 18.9398, lng: 72.8355, note: "Main approach road cab bay" },
    { kind: "rail", label: "Mumbai Central Railway Station", lat: 18.9696, lng: 72.8193, note: "Outside west entrance" },
  ],
  "Delhi NCR": [
    { kind: "airport", label: "Indira Gandhi International Airport (DEL), T3", lat: 28.5562, lng: 77.1, note: "Terminal 3 departures, Gate 5" },
    { kind: "rail", label: "New Delhi Railway Station", lat: 28.6431, lng: 77.2197, note: "Ajmeri Gate side cab bay" },
    { kind: "rail", label: "Hazrat Nizamuddin Railway Station", lat: 28.5883, lng: 77.2507, note: "Main entrance cab stand" },
  ],
  Hyderabad: [
    { kind: "airport", label: "Rajiv Gandhi International Airport (HYD)", lat: 17.2403, lng: 78.4294, note: "Departures level cab bay" },
    { kind: "rail", label: "Secunderabad Junction Railway Station", lat: 17.4337, lng: 78.5013, note: "Main entrance cab stand" },
  ],
  Pune: [
    { kind: "airport", label: "Pune International Airport (PNQ)", lat: 18.5821, lng: 73.9197, note: "Departures forecourt" },
    { kind: "rail", label: "Pune Junction Railway Station", lat: 18.529, lng: 73.8744, note: "Main entrance cab bay" },
  ],
  Kolkata: [
    { kind: "airport", label: "Netaji Subhas Chandra Bose International Airport (CCU)", lat: 22.6547, lng: 88.4467, note: "Departures gate" },
    { kind: "rail", label: "Howrah Junction Railway Station", lat: 22.5839, lng: 88.3425, note: "Cab bay at main terminal" },
  ],
};
