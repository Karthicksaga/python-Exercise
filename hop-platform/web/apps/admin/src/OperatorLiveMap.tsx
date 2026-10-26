import { useCallback, useEffect, useState } from "react";
import { api } from "@hop/shared/api";
import { MapCanvas, MapFit, MapLine, MapMarker } from "@hop/shared/mapkit";
import { Badge, Button, Group, Paper, Select, Switch, Text } from "@mantine/core";
import RealisticVehicleMarker from "@hop/shared/RealisticVehicleMarker";

export type LiveDriver = {
  user_id: string;
  name: string;
  email: string;
  vehicle_category: string;
  vehicle_number: string;
  online: boolean;
  status: string;
  lat: number;
  lng: number;
  location_at: string | null;
  updated_at: string;
};

export type ActiveRide = {
  id: string;
  status: string;
  payment_method: string;
  payment_status: string;
  created_at: string;
  rider_name: string;
  driver_name: string;
  vehicle_category: string;
  vehicle_number: string;
  pickup_label: string;
  dropoff_label: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  driver_lat?: number;
  driver_lng?: number;
  fare_paise: number;
};

export type ServiceArea = {
  id: string;
  name: string;
  state: string;
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  active: boolean;
};

type LiveData = {
  drivers: LiveDriver[];
  active_rides: ActiveRide[];
  areas: ServiceArea[];
};

export default function OperatorLiveMap({ notify }: { notify: (msg: string) => void }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string | null>("all");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<LiveDriver | null>(null);
  const [selectedRide, setSelectedRide] = useState<ActiveRide | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 13.0827, lng: 80.2707 });

  const loadData = useCallback(async () => {
    try {
      const res = await api<LiveData>("/api/operator/live-map");
      setData(res);
      // Auto-set center to first online driver or first area if default
      if (res.drivers.length > 0 && res.drivers[0].lat && res.drivers[0].lng) {
        setMapCenter({ lat: res.drivers[0].lat, lng: res.drivers[0].lng });
      } else if (res.areas.length > 0) {
        setMapCenter({
          lat: (res.areas[0].min_lat + res.areas[0].max_lat) / 2,
          lng: (res.areas[0].min_lng + res.areas[0].max_lng) / 2,
        });
      }
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadData();
    }, 6000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadData]);

  const filteredDrivers = (data?.drivers ?? []).filter((d) => {
    if (onlineOnly && !d.online) return false;
    if (categoryFilter && categoryFilter !== "all" && d.vehicle_category !== categoryFilter) return false;
    return true;
  });

  const getVehicleIcon = (category: string) => {
    switch (category) {
      case "auto":
        return "🛺";
      case "bike":
        return "🏍️";
      case "suv":
        return "🚙";
      default:
        return "🚗";
    }
  };

  return (
    <div className="live-map-container">
      {/* Top Filter and Controls Bar */}
      <Paper p="sm" withBorder style={{ background: "#ffffff", borderRadius: 8 }}>
        <Group justify="space-between" wrap="wrap">
          <Group gap="sm">
            <Select
              size="xs"
              label="Vehicle Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              data={[
                { value: "all", label: "All Vehicles" },
                { value: "auto", label: "Auto (🛺)" },
                { value: "bike", label: "Bike (🏍️)" },
                { value: "mini", label: "Mini (🚗)" },
                { value: "sedan", label: "Sedan (🚘)" },
                { value: "suv", label: "SUV (🚙)" },
              ]}
              style={{ width: 160 }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Text size="xs" c="dimmed">Status Filter</Text>
              <Switch
                size="xs"
                checked={onlineOnly}
                onChange={(e) => setOnlineOnly(e.currentTarget.checked)}
                label="Online Drivers Only"
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Text size="xs" c="dimmed">Live Sync</Text>
              <Switch
                size="xs"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.currentTarget.checked)}
                label="Auto-refresh (6s)"
              />
            </div>
          </Group>

          <Group gap="md">
            <Badge color="green" size="lg" variant="light">
              🟢 {data?.drivers.filter((d) => d.online).length ?? 0} Online
            </Badge>
            <Badge color="blue" size="lg" variant="light">
              🚕 {data?.active_rides.length ?? 0} Trips Active
            </Badge>
            <Badge color="gray" size="lg" variant="outline">
              📍 {data?.areas.length ?? 0} Zones
            </Badge>
            <Button size="xs" variant="default" onClick={() => void loadData()} loading={loading}>
              ↻ Refresh
            </Button>
          </Group>
        </Group>
      </Paper>

      {/* Main Map + Sidebar Grid */}
      <div className="dispatch-grid">
        {/* Map Canvas */}
        <Paper withBorder className="dispatch-map">
          <MapCanvas center={mapCenter} zoom={13}>
            {selectedRide && (
              <MapFit
                points={[
                  { lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng },
                  { lat: selectedRide.dropoff_lat, lng: selectedRide.dropoff_lng },
                  ...(selectedRide.driver_lat && selectedRide.driver_lng ? [{ lat: selectedRide.driver_lat, lng: selectedRide.driver_lng }] : []),
                ]}
                padding={60}
                extra={selectedRide.id}
              />
            )}

            {/* Active Trips Routes */}
            {data?.active_rides.map((ride) => {
              const p = { lat: ride.pickup_lat, lng: ride.pickup_lng };
              const d = { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
              const isSelected = selectedRide?.id === ride.id;
              return (
                <div key={ride.id}>
                  <MapLine path={[p, d]} color={isSelected ? "#b84333" : "#3b82f6"} weight={isSelected ? 6 : 4} />
                  <MapMarker position={p} title={`Pickup: ${ride.pickup_label}`}>
                    <div
                      onClick={() => {
                        setSelectedRide(ride);
                        setSelectedDriver(null);
                      }}
                      style={{
                        background: "#10b981",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        border: "1.5px solid #fff",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      }}
                    >
                      P
                    </div>
                  </MapMarker>
                  <MapMarker position={d} title={`Dropoff: ${ride.dropoff_label}`}>
                    <div
                      onClick={() => {
                        setSelectedRide(ride);
                        setSelectedDriver(null);
                      }}
                      style={{
                        background: "#ef4444",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                        border: "1.5px solid #fff",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                      }}
                    >
                      D
                    </div>
                  </MapMarker>
                  {ride.driver_lat && ride.driver_lng && (
                    <MapMarker position={{ lat: ride.driver_lat, lng: ride.driver_lng }} title={`Driver: ${ride.driver_name}`} anchor="center">
                      <div
                        onClick={() => {
                          setSelectedRide(ride);
                          setSelectedDriver(null);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <RealisticVehicleMarker
                          category={ride.vehicle_category}
                          size={42}
                          showShadow
                        />
                      </div>
                    </MapMarker>
                  )}
                </div>
              );
            })}

            {/* Drivers Markers */}
            {filteredDrivers.map((driver) => {
              const isSelected = selectedDriver?.user_id === driver.user_id;
              return (
                <MapMarker
                  key={driver.user_id}
                  position={{ lat: driver.lat, lng: driver.lng }}
                  title={`${driver.name} (${driver.vehicle_number})`}
                  anchor="center"
                >
                  <div
                    onClick={() => {
                      setSelectedDriver(driver);
                      setSelectedRide(null);
                    }}
                    style={{
                      cursor: "pointer",
                      opacity: driver.online ? 1 : 0.65,
                      transform: isSelected ? "scale(1.25)" : "scale(1)",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <RealisticVehicleMarker
                      category={driver.vehicle_category}
                      size={36}
                      showShadow
                    />
                  </div>
                </MapMarker>
              );
            })}
          </MapCanvas>
        </Paper>

        {/* Live List & Detail Sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto" }}>
          {/* Inspector Card if Selected */}
          {selectedDriver && (
            <Paper p="sm" withBorder style={{ background: "#f8fafc", borderRadius: 8, borderLeft: "4px solid #b84333" }}>
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="sm">{selectedDriver.name}</Text>
                <Badge color={selectedDriver.online ? "green" : "gray"}>
                  {selectedDriver.online ? "Online" : "Offline"}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">Vehicle: {selectedDriver.vehicle_number} ({selectedDriver.vehicle_category})</Text>
              <Text size="xs" c="dimmed">Email: {selectedDriver.email}</Text>
              <Text size="xs" c="dimmed">Coords: {selectedDriver.lat.toFixed(4)}, {selectedDriver.lng.toFixed(4)}</Text>
              <Button
                size="xs"
                variant="subtle"
                fullWidth
                mt="xs"
                onClick={() => setMapCenter({ lat: selectedDriver.lat, lng: selectedDriver.lng })}
              >
                Center On Driver
              </Button>
            </Paper>
          )}

          {selectedRide && (
            <Paper p="sm" withBorder style={{ background: "#f8fafc", borderRadius: 8, borderLeft: "4px solid #3b82f6" }}>
              <Group justify="space-between" mb="xs">
                <Text fw={700} size="sm">Trip #{selectedRide.id.slice(0, 8)}</Text>
                <Badge color="blue">{selectedRide.status}</Badge>
              </Group>
              <Text size="xs"><b>Rider:</b> {selectedRide.rider_name}</Text>
              <Text size="xs"><b>Driver:</b> {selectedRide.driver_name || "Assigning..."}</Text>
              <Text size="xs"><b>From:</b> {selectedRide.pickup_label}</Text>
              <Text size="xs"><b>To:</b> {selectedRide.dropoff_label}</Text>
              <Text size="xs" fw={600} mt={4}>Fare: ₹{(selectedRide.fare_paise / 100).toFixed(2)}</Text>
              <Button
                size="xs"
                variant="subtle"
                fullWidth
                mt="xs"
                onClick={() => setMapCenter({ lat: selectedRide.pickup_lat, lng: selectedRide.pickup_lng })}
              >
                Center On Trip
              </Button>
            </Paper>
          )}

          {/* Active Rides Panel */}
          <Paper p="sm" withBorder style={{ borderRadius: 8 }}>
            <Text fw={700} size="sm" mb="xs">Active Rides ({data?.active_rides.length ?? 0})</Text>
            {(!data?.active_rides || data.active_rides.length === 0) ? (
              <Text size="xs" c="dimmed">No active trips in transit right now.</Text>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
                {data.active_rides.map((ride) => (
                  <div
                    key={ride.id}
                    onClick={() => {
                      setSelectedRide(ride);
                      setSelectedDriver(null);
                      setMapCenter({ lat: ride.pickup_lat, lng: ride.pickup_lng });
                    }}
                    style={{
                      padding: 8,
                      borderRadius: 6,
                      background: selectedRide?.id === ride.id ? "#eff6ff" : "#f1f5f9",
                      cursor: "pointer",
                      border: selectedRide?.id === ride.id ? "1px solid #3b82f6" : "1px solid transparent",
                    }}
                  >
                    <Group justify="space-between">
                      <Text size="xs" fw={600}>{ride.rider_name}</Text>
                      <Badge size="xs" color="blue">{ride.status}</Badge>
                    </Group>
                    <Text size="xs" c="dimmed" lineClamp={1}>📍 {ride.pickup_label} ➔ {ride.dropoff_label}</Text>
                  </div>
                ))}
              </div>
            )}
          </Paper>

          {/* Online Drivers Panel */}
          <Paper p="sm" withBorder style={{ borderRadius: 8, flex: 1, minHeight: 0 }}>
            <Text fw={700} size="sm" mb="xs">Fleet Drivers ({filteredDrivers.length})</Text>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {filteredDrivers.map((driver) => (
                <div
                  key={driver.user_id}
                  onClick={() => {
                    setSelectedDriver(driver);
                    setSelectedRide(null);
                    setMapCenter({ lat: driver.lat, lng: driver.lng });
                  }}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    background: selectedDriver?.user_id === driver.user_id ? "#fef2f2" : "#f8fafc",
                    cursor: "pointer",
                    border: selectedDriver?.user_id === driver.user_id ? "1px solid #b84333" : "1px solid transparent",
                  }}
                >
                  <Group justify="space-between">
                    <Text size="xs" fw={600}>{getVehicleIcon(driver.vehicle_category)} {driver.name}</Text>
                    <Badge size="xs" color={driver.online ? "green" : "gray"}>
                      {driver.online ? "Online" : "Offline"}
                    </Badge>
                  </Group>
                  <Text size="xs" c="dimmed">{driver.vehicle_number} · {driver.vehicle_category}</Text>
                </div>
              ))}
            </div>
          </Paper>
        </div>
      </div>
    </div>
  );
}
