import MapControls from "@hop/shared/MapControls";
import { useEffect, useRef, useState } from "react";
import { MapCanvas, MapFit, MapFollow, MapLine, MapMarker } from "@hop/shared/mapkit";
import { hotZone, kmText, MapToolbar, MapToolLayers, useDemand, useMapTools } from "@hop/shared/MapExtras";
import { useGlide } from "@hop/shared/LiveNavMap";
import { money, type Area, type Ride } from "@hop/shared/types";

type Pos = { lat: number; lng: number };

// Live driver map: your position, each request's pickup/drop and its road route.
export default function DriverMap({ area, pos: rawPos, rides, notify, nudge }: { area: Area; pos: Pos | null; rides: Ride[]; notify?: (s: string) => void; nudge?: boolean }) {
  const pos = useGlide(rawPos ?? undefined) ?? null;
  const tools = useMapTools({ demand: true });
  const cells = useDemand(true);
  const [follow, setFollow] = useState(true);
  const [heading, setHeading] = useState(0);
  const prev = useRef<Pos | null>(null);
  useEffect(() => {
    if (!pos) return;
    const p = prev.current;
    if (p && Math.abs(p.lat - pos.lat) + Math.abs(p.lng - pos.lng) > 0.00003) {
      const r = Math.PI / 180;
      const y = Math.sin((pos.lng - p.lng) * r) * Math.cos(pos.lat * r);
      const x = Math.cos(p.lat * r) * Math.sin(pos.lat * r) - Math.sin(p.lat * r) * Math.cos(pos.lat * r) * Math.cos((pos.lng - p.lng) * r);
      const next = (Math.atan2(y, x) / r + 360) % 360;
      setHeading((h) => h + ((((next - h) % 360) + 540) % 360) - 180);
    }
    prev.current = pos;
  }, [pos?.lat, pos?.lng]);
  const points = [...(pos ? [pos] : []), ...rides.flatMap((r) => [{ lat: r.pickup_lat, lng: r.pickup_lng }, { lat: r.dropoff_lat, lng: r.dropoff_lng }])];
  return (
    <div className={"map-frame driver-map" + (tools.full ? " map-full" : "")} aria-label="Driver map">
      <MapCanvas
        center={pos ?? { lat: (area.min_lat + area.max_lat) / 2, lng: (area.min_lng + area.max_lng) / 2 }}
        zoom={13}
        onUserDrag={() => setFollow(false)}
        onClick={(p) => void tools.onMapClick(p)}
      >
        <MapToolLayers tools={tools} demand cells={cells} />
        {follow && pos ? <MapFollow center={pos} minZoom={15} /> : <MapFit points={points} extra={`${follow}|${rides.map((r) => r.id).join(",")}`} />}
        {rides.map((r) =>
          r.route && r.route.length > 1 ? (
            <span key={"route" + r.id}>
              <MapLine path={r.route} color="#ffffff" weight={9} />
              <MapLine path={r.route} color="#059669" weight={5} />
            </span>
          ) : null,
        )}
        {pos && (
          <MapMarker position={pos} title="You" anchor="center">
            <div className="me-dot" aria-label="Your live location">
              <span className="me-pulse" />
              <svg viewBox="0 0 24 24" width="38" height="38" style={{ transform: `rotate(${heading}deg)` }}>
                <circle cx="12" cy="12" r="10.5" fill="#059669" stroke="#fff" strokeWidth="1.8" />
                <path d="M12 4.5l4.6 12.5-4.6-2.6-4.6 2.6z" fill="#fff" />
              </svg>
            </div>
          </MapMarker>
        )}
        {rides.map((r) => (
          <span key={r.id}>
            <MapMarker position={{ lat: r.pickup_lat, lng: r.pickup_lng }} title="Pickup">
              <span className="pin-tag pickup-tag">Pickup · {money(r.fare_paise)}</span>
              <span className="map-pin pickup-pin" />
            </MapMarker>
            <MapMarker position={{ lat: r.dropoff_lat, lng: r.dropoff_lng }} title="Drop">
              <span className="pin-tag drop-tag">Drop</span>
              <span className="map-pin destination-pin" />
            </MapMarker>
          </span>
        ))}
      </MapCanvas>
      <MapControls at={pos ?? undefined} notify={notify} />
      <MapToolbar
        tools={tools}
        areaId={area.id}
        area={area.name}
        demand
        sheet={
          rides.length > 0 && (
            <div className="sheet-grid">
              {rides.slice(0, 2).map((r) => (
                <div key={r.id}><small>{r.pickup_label.split(",")[0]} →</small><strong>{money(r.fare_paise)}</strong><em>{(r.meters / 1000).toFixed(1)} km</em></div>
              ))}
            </div>
          )
        }
      />
      {nudge && (() => {
        const hz = hotZone(cells, rawPos);
        return hz ? (
          <div className="hot-zone" role="status">
            <span aria-hidden>🔥</span>
            <div><strong>High demand {kmText(hz.distance)} away</strong><small>{hz.requests} requests in 45 min · {hz.drivers ?? 0} driver{hz.drivers === 1 ? "" : "s"} nearby</small></div>
            <button type="button" onClick={() => { tools.setShowDemand(true); setFollow(false); tools.goTo(hz); }}>Show</button>
            <a className="hz-go" href={`https://www.google.com/maps/dir/?api=1&destination=${hz.lat},${hz.lng}&travelmode=driving`} target="_blank" rel="noreferrer">Go</a>
          </div>
        ) : null;
      })()}
      <span className="live-chip"><i /> LIVE</span>
      <button type="button" className="recenter" onClick={() => setFollow((f) => !f)}>
        {follow ? "Show requests" : "◎ Follow me"}
      </button>
    </div>
  );
}
