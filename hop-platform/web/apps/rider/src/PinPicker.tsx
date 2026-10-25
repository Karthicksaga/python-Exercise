import { useEffect, useRef, useState } from "react";
import { Badge, Button, Group, Text } from "@mantine/core";
import { IconPlane, IconTrain } from "@tabler/icons-react";
import { hubs } from "@hop/shared/hubs";
import type { Kind } from "./MapPicker";
import type { NearbyDriver, Point } from "@hop/shared/types";

type LatLng = { lat: number; lng: number };
const dist = (a: LatLng, b: LatLng) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 105);

// Rapido-style centre pin: drag the map under a fixed pin, see the address and the nearest cab, then confirm.
export function PinOverlay({ moving }: { moving: boolean }) {
  return (
    <div className={"center-pin" + (moving ? " lifted" : "")} aria-hidden="true">
      <span className="cp-bubble">{moving ? "Release to set" : "Move map to adjust"}</span>
      <span className="cp-head" />
      <span className="cp-stick" />
      <span className="cp-shadow" />
    </div>
  );
}

export function PinCard({
  area, target, center, moving, drivers, reverse, onConfirm, onCancel,
}: {
  area: string; target: Kind; center: LatLng; moving: boolean; drivers?: NearbyDriver[];
  reverse: (lat: number, lng: number) => Promise<string>; onConfirm: (p: Point) => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const seq = useRef(0);
  useEffect(() => {
    if (moving) return;
    const n = ++seq.current;
    setLabel("");
    const t = setTimeout(() => void reverse(center.lat, center.lng).then((l) => n === seq.current && setLabel(l)), 250);
    return () => clearTimeout(t);
  }, [center.lat, center.lng, moving, reverse]);

  const near = (drivers ?? []).map((d) => dist(d, center)).sort((a, b) => a - b);
  const closest = near[0];
  const eta = closest === undefined ? null : Math.max(1, Math.round((closest / 22) * 60));
  const hubsHere = (hubs[area] ?? []).filter((h) => dist(h, center) < 3);
  const pickup = target === "pickup";

  return (
    <div className="pin-card" role="dialog" aria-label="Confirm pin location">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0 }}>
          <Text size="xs" c="dimmed" fw={600} tt="uppercase">{pickup ? "Pickup here" : "Drop here"}</Text>
          <Text fw={700} size="sm" lineClamp={2}>{moving || !label ? "Finding address…" : label}</Text>
        </div>
        {pickup && eta !== null && <Badge size="lg" color="teal" variant="light">{eta} min away</Badge>}
      </Group>
      {pickup && closest === undefined && <Text size="xs" c="dimmed" mt={4}>No cabs close to this pin right now.</Text>}
      {hubsHere.map((h) => (
        <Button key={h.label} mt={8} fullWidth size="compact-sm" variant="light" leftSection={h.kind === "airport" ? <IconPlane size={14} /> : <IconTrain size={14} />} onClick={() => onConfirm(h)}>
          Use official bay: {h.note}
        </Button>
      ))}
      <Group mt="sm" grow>
        <Button variant="default" onClick={onCancel}>Cancel</Button>
        <Button disabled={moving || !label} onClick={() => onConfirm({ ...center, label })}>{pickup ? "Confirm pickup" : "Confirm drop"}</Button>
      </Group>
    </div>
  );
}
