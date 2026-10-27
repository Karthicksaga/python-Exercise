import { useCallback, useState } from "react";
import { api } from "@hop/shared/api";
import { NearbyCar } from "./NearbyCar";
import { MapCanvas, MapFit, MapLine, MapMarker, MapPan } from "@hop/shared/mapkit";
import { PinCard, PinOverlay } from "./PinPicker";
import { MapToolLayers, trafficNow, useMapTools, type MapTools, type Poi } from "@hop/shared/MapExtras";
import type { Area, NearbyDriver, Point, RoutePoint } from "@hop/shared/types";

export type Kind = "pickup" | "dropoff";

export function useReverseGeocode() {
  return useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      return (await api<{ label: string }>(`/api/places/reverse?lat=${lat}&lng=${lng}`)).label;
    } catch {
      return `Pinned location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
  }, []);
}

function BookingMap({
  area,
  pickup,
  dropoff,
  route,
  drivers,
  vehicleCategory,
  target,
  onSelect,
  onTargetChange,
  pois,
  summary,
  tools,
  onPinStart,
}: {
  tools: MapTools;
  pois?: Poi[];
  summary?: { meters: number; seconds: number; fare_paise: number };
  area: Area;
  pickup: Point | null;
  dropoff: Point | null;
  route?: RoutePoint[];
  drivers?: NearbyDriver[];
  vehicleCategory?: string;
  target: Kind;
  onSelect: (kind: Kind, point: Point) => void;
  onTargetChange: (kind: Kind) => void;
  notify?: (s: string) => void;
  onPinStart?: () => void;
}) {
  const reverse = useReverseGeocode();
  const traffic = trafficNow();
  const [pin, setPin] = useState(false);
  const [moving, setMoving] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pending, setPending] = useState<{ lat: number; lng: number; label: string } | null>(null);

  const fitPoints = (route?.length ? route : [pickup, dropoff].filter((p): p is Point => p !== null)) as RoutePoint[];
  const fitKey = `${pickup?.lat},${pickup?.lng},${dropoff?.lat},${dropoff?.lng},${route?.length ?? 0}`;

  function startPin() {
    onPinStart?.();
    setPending(null);
    setCenter(focus);
    setPin(true);
  }

  async function place(lat: number, lng: number) {
    setPending({ lat, lng, label: "Finding address…" });
    const label = await reverse(lat, lng);
    setPending((p) => (p && p.lat === lat && p.lng === lng ? { lat, lng, label } : p));
  }
  async function drag(kind: Kind, lat: number, lng: number) {
    onSelect(kind, { lat, lng, label: await reverse(lat, lng) });
  }
  const focus = (target === "pickup" ? pickup : dropoff) ?? pickup ?? { lat: (area.min_lat + area.max_lat) / 2, lng: (area.min_lng + area.max_lng) / 2 };
  function pinConfirm(p: Point) {
    onSelect(target, p);
    if (target === "pickup") {
      onTargetChange("dropoff");
      setCenter(dropoff ?? p);
    } else setPin(false);
  }
  function confirm() {
    if (!pending) return;
    onSelect(target, { lat: pending.lat, lng: pending.lng, label: pending.label });
    if (target === "pickup") onTargetChange("dropoff");
    setPending(null);
  }

  return (
    <>
      <MapCanvas
        center={{ lat: (area.min_lat + area.max_lat) / 2, lng: (area.min_lng + area.max_lng) / 2 }}
        zoom={12}
        restriction={{ north: area.max_lat, south: area.min_lat, east: area.max_lng, west: area.min_lng }}
        onClick={(p) => !pin && !tools.onMapClick(p) && void place(p.lat, p.lng)}
        onCenterChange={(p, m) => {
          if (!pin) return;
          setMoving(m);
          if (!m) setCenter(p);
        }}
      >
        <MapToolLayers tools={tools} area={area.name} pois={pois} onPick={(p) => void place(p.lat, p.lng)} />
        {pin && <MapPan point={focus} extra={`${target}-${pin}`} />}
        {!pin && <MapFit points={fitPoints} extra={fitKey} />}
        {pickup && (
          <MapMarker position={pickup} title="Pickup (drag to adjust)" draggable onDragEnd={(lat, lng) => void drag("pickup", lat, lng)} anchor="center">
            <span className="pin-tag pickup-tag">Pickup</span>
            <span className="map-pin pickup-pin" aria-label="Pickup marker" />
          </MapMarker>
        )}
        {dropoff && (
          <MapMarker position={dropoff} title="Destination (drag to adjust)" draggable onDragEnd={(lat, lng) => void drag("dropoff", lat, lng)} anchor="center">
            <span className="pin-tag drop-tag">Drop</span>
            <span className="map-pin destination-pin" aria-label="Destination marker" />
          </MapMarker>
        )}
        {pending && (
          <MapMarker position={pending} anchor="center">
            <span className="map-pin pending-pin" aria-label="Selected point" />
          </MapMarker>
        )}
        {route && route.length > 1 && (
          <>
            <MapLine path={route} color="#ffffff" weight={10} />
            <MapLine path={route} color={summary ? traffic.color : "#4f46e5"} weight={5} />
          </>
        )}
        {drivers
          ?.filter((d) => !vehicleCategory || d.category === vehicleCategory)
          .map((d, i) => (
            <NearbyCar key={d.id ?? i} driver={d} />
          ))}
      </MapCanvas>
      {!pin && (
        <button
          type="button"
          className="pin-fab"
          onClick={startPin}
          title={`Set ${target === "pickup" ? "pickup" : "destination"} location with interactive pin`}
        >
          📍 Set {target === "pickup" ? "pickup" : "drop"} with pin
        </button>
      )}
      <button
        type="button"
        className="recenter"
        onClick={() => {
          if (pickup) tools.goTo(pickup);
          else tools.locate();
        }}
        title="Center map on my location or pickup"
      >
        {tools.locating ? "Locating…" : "◎ My location"}
      </button>
      {pin && <PinOverlay moving={moving} />}
      {pin && center && (
        <PinCard area={area.name} target={target} center={center} moving={moving} drivers={drivers?.filter((d) => !vehicleCategory || d.category === vehicleCategory)} reverse={reverse} onConfirm={pinConfirm} onCancel={() => { setPin(false); setMoving(false); }} />
      )}
      {pending && !pin && (
        <div className="confirm-bar" role="dialog" aria-label="Confirm location">
          <div>
            <small>{target === "pickup" ? "Set pickup here?" : "Set destination here?"}</small>
            <strong>{pending.label}</strong>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button type="button" onClick={confirm}>
              Confirm {target === "pickup" ? "pickup" : "destination"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function MapPicker(props: {
  pois?: Poi[];
  summary?: { meters: number; seconds: number; fare_paise: number };
  area: Area;
  pickup: Point | null;
  dropoff: Point | null;
  route?: RoutePoint[];
  drivers?: NearbyDriver[];
  vehicleCategory?: string;
  target: Kind;
  onSelect: (kind: Kind, point: Point) => void;
  onTargetChange: (kind: Kind) => void;
  notify?: (s: string) => void;
  onPinStart?: () => void;
}) {
  const tools = useMapTools();
  return (
    <div className={"map-frame" + (tools.full ? " map-full" : "")} aria-label="Pickup and destination map">
      <BookingMap {...props} tools={tools} />
    </div>
  );
}
