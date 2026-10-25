import { useState } from "react";
import { ActionIcon, Button, Group, Switch, Tooltip } from "@mantine/core";
import { saveAreaOffline } from "./offlineTiles";
import { IconBuildingSkyscraper, IconMoon, IconSun, IconTrafficLights } from "@tabler/icons-react";
import { useMapProvider } from "./mapProvider";
import { isDark, setMapPrefs, useMapPrefs } from "./mapPrefs";

// Floating layer switches: live traffic, 3D tilt, night map and low-data mode.
export default function MapControls({ at, notify }: { at?: { lat: number; lng: number }; notify?: (s: string) => void }) {
  const [saving, setSaving] = useState(false);
  const p = useMapPrefs();
  const google = useMapProvider() === "google";
  const dark = isDark(p);
  return (
    <div className="map-controls" role="group" aria-label="Map layers">
      {google && !p.lowData && (
        <Group gap={6}>
          <Tooltip label="Live traffic"><ActionIcon size="lg" radius="xl" variant="filled" color={p.traffic ? "indigo" : "dark"} aria-pressed={p.traffic} aria-label="Traffic" onClick={() => setMapPrefs({ traffic: !p.traffic })}><IconTrafficLights size={18} /></ActionIcon></Tooltip>
          <Tooltip label="3D tilt & buildings"><ActionIcon size="lg" radius="xl" variant="filled" color={p.tilt ? "indigo" : "dark"} aria-pressed={p.tilt} aria-label="3D view" onClick={() => setMapPrefs({ tilt: !p.tilt })}><IconBuildingSkyscraper size={18} /></ActionIcon></Tooltip>
          <Tooltip label={`Night map: ${p.dark}`}><ActionIcon size="lg" radius="xl" variant="filled" color={dark ? "indigo" : "dark"} aria-label="Night map" onClick={() => setMapPrefs({ dark: p.dark === "auto" ? "on" : p.dark === "on" ? "off" : "auto" })}>{dark ? <IconMoon size={18} /> : <IconSun size={18} />}</ActionIcon></Tooltip>
        </Group>
      )}
      {at && p.lowData && (
        <Button size="compact-xs" radius="xl" variant="filled" color="dark" loading={saving} onClick={() => { setSaving(true); saveAreaOffline(at.lat, at.lng).then((n) => notify?.(n ? `Saved ${n} map tiles for offline use.` : "This area is already saved offline.")).catch((e: Error) => notify?.(e.message)).finally(() => setSaving(false)); }}>
          ⬇ Save this area offline
        </Button>
      )}
      <Switch size="xs" className="lowdata-switch" checked={p.lowData} onChange={(e) => setMapPrefs({ lowData: e.currentTarget.checked })} label={p.lowData ? "Low data ON" : "Low data"} />
    </div>
  );
}
