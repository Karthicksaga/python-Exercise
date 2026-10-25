import { useEffect, useRef, useState } from "react";
import { MapCanvas, MapFit, MapLine, MapMarker } from "./mapkit";
import type { Ride } from "./types";
import RealisticVehicleMarker from "./RealisticVehicleMarker";

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// Glides the car marker between location updates instead of teleporting it.
function useSmoothPosition(target?: { lat: number; lng: number }) {
  const [pos, setPos] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (!target) {
      current.current = undefined;
      setPos(undefined);
      return;
    }
    const from = current.current ?? target;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      const next = { lat: from.lat + (target.lat - from.lat) * t, lng: from.lng + (target.lng - from.lng) * t };
      current.current = next;
      setPos(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target?.lat, target?.lng]);
  return pos;
}

export default function RideRouteMap({ ride }: { ride: Ride }) {
  const route = ride.route ?? [];
  const rawDriver =
    ride.driver_lat !== undefined && ride.driver_lat !== null && ride.driver_lng !== undefined && ride.driver_lng !== null
      ? { lat: ride.driver_lat, lng: ride.driver_lng }
      : undefined;
  const driver = useSmoothPosition(rawDriver);

  const [heading, setHeading] = useState(0);
  const prevPos = useRef(rawDriver);
  useEffect(() => {
    if (rawDriver && prevPos.current) {
      if (Math.abs(rawDriver.lat - prevPos.current.lat) + Math.abs(rawDriver.lng - prevPos.current.lng) > 0.00002) {
        setHeading(bearing(prevPos.current, rawDriver));
      }
    }
    if (rawDriver) prevPos.current = rawDriver;
  }, [rawDriver?.lat, rawDriver?.lng]);

  if (route.length < 2) return null;

  const pickup = { lat: ride.pickup_lat, lng: ride.pickup_lng };
  const dropoff = { lat: ride.dropoff_lat, lng: ride.dropoff_lng };

  return (
    <section className="ride-route" aria-label="Ride route">
      <h3>Route</h3>
      <div className="ride-route-map">
        <MapCanvas center={pickup} zoom={13}>
          <MapFit points={[pickup, dropoff, ...route]} padding={48} extra={`${ride.id}|${route.length}|${Boolean(driver)}`} />
          <MapLine path={route} color="#ffffff" weight={11} />
          <MapLine path={route} color="#4f46e5" weight={6} />
          <MapMarker position={pickup} title="Pickup">
            <span className="pin-tag pickup-tag">Pickup</span>
            <span className="map-pin pickup-pin" aria-label="Pickup marker" />
          </MapMarker>
          <MapMarker position={dropoff} title="Destination">
            <span className="pin-tag drop-tag">Drop</span>
            <span className="map-pin destination-pin" aria-label="Destination marker" />
          </MapMarker>
          {driver && (
            <MapMarker position={driver} title="Your driver" anchor="center">
              <RealisticVehicleMarker
                category={ride.vehicle_category}
                heading={heading}
                size={46}
                showShadow
              />
            </MapMarker>
          )}
        </MapCanvas>
      </div>
    </section>
  );
}