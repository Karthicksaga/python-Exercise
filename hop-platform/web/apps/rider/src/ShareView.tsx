import { useEffect, useState, useRef } from "react";
import { MapCanvas, MapFit, MapMarker } from "@hop/shared/mapkit";
import { useGlide } from "@hop/shared/LiveNavMap";
import MapBoundary from "@hop/shared/MapBoundary";
import RealisticVehicleMarker from "@hop/shared/RealisticVehicleMarker";

type Share = {
  status: string;
  pickup: string;
  dropoff: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  driver_name: string | null;
  vehicle_number: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
  driver_location_at: string | null;
  shared_until: string;
};

export default function ShareView({ token }: { token: string }) {
  const [share, setShare] = useState<Share | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/share/${encodeURIComponent(token)}`);
      const body = await res.json();
      if (!res.ok) {
        setShare(null);
        setError(body.error || "Unable to load trip");
      } else {
        setError("");
        setShare(body);
      }
    };
    load().catch(() => setError("Unable to load trip"));
    const id = setInterval(() => load().catch(() => undefined), 10000);
    return () => clearInterval(id);
  }, [token]);
  const raw = share && share.driver_lat !== null && share.driver_lng !== null ? { lat: share.driver_lat, lng: share.driver_lng } : undefined;
  const driver = useGlide(raw);
  const prevLocRef = useRef<{ lat: number; lng: number } | null>(null);
  const [heading, setHeading] = useState(0);
  useEffect(() => {
    if (driver && prevLocRef.current) {
      const dLat = driver.lat - prevLocRef.current.lat;
      const dLng = driver.lng - prevLocRef.current.lng;
      if (Math.hypot(dLat, dLng) > 0.00005) {
        const rad = Math.atan2(dLng, dLat);
        const deg = (rad * 180) / Math.PI;
        setHeading((deg + 360) % 360);
      }
    }
    if (driver) prevLocRef.current = driver;
  }, [driver?.lat, driver?.lng]);

  return (
    <main className="panel narrow" style={{ margin: "40px auto" }}>
      <p className="eyebrow">LIVE TRIP</p>
      <h1>Following a hop ride</h1>
      {error && <p role="alert">{error}</p>}
      {share && (
        <>
          <p>Status: <strong>{share.status.replace("_", " ")}</strong></p>
          <p>{share.pickup} → {share.dropoff}</p>
          <p>Driver: {share.driver_name} · {share.vehicle_number}</p>
          <MapBoundary>
            <div className="map-frame share-map" aria-label="Live trip map">
              <MapCanvas center={{ lat: share.pickup_lat, lng: share.pickup_lng }} zoom={13}>
                <MapFit points={[{ lat: share.pickup_lat, lng: share.pickup_lng }, { lat: share.dropoff_lat, lng: share.dropoff_lng }, ...(driver ? [driver] : [])]} extra={share.status} />
                <MapMarker position={{ lat: share.pickup_lat, lng: share.pickup_lng }} title="Pickup"><span className="pin-tag pickup-tag">Pickup</span><span className="map-pin pickup-pin" /></MapMarker>
                <MapMarker position={{ lat: share.dropoff_lat, lng: share.dropoff_lng }} title="Drop"><span className="pin-tag drop-tag">Drop</span><span className="map-pin destination-pin" /></MapMarker>
                {driver && (
                  <MapMarker position={driver} title="Driver" anchor="center">
                    <RealisticVehicleMarker
                      category="car"
                      heading={heading}
                      size={44}
                      showShadow
                      className="share-vehicle"
                    />
                  </MapMarker>
                )}
              </MapCanvas>
              <span className="live-chip"><i /> LIVE</span>
            </div>
          </MapBoundary>
          {share.driver_lat !== null && share.driver_lng !== null && (
            <p>
              Driver location:{" "}
              <a href={`https://www.openstreetmap.org/?mlat=${share.driver_lat}&mlon=${share.driver_lng}#map=16/${share.driver_lat}/${share.driver_lng}`} target="_blank" rel="noreferrer">
                {share.driver_lat.toFixed(4)}, {share.driver_lng.toFixed(4)}
              </a>
              {share.driver_location_at && ` (updated ${new Date(share.driver_location_at).toLocaleTimeString()})`}
            </p>
          )}
          <p className="muted">Link expires {new Date(share.shared_until).toLocaleTimeString()}. Updates every 10 seconds.</p>
        </>
      )}
    </main>
  );
}
