import { useEffect, useState } from "react";
import { Badge, Group, Text, UnstyledButton } from "@mantine/core";
import { api } from "@hop/shared/api";
import type { Point } from "@hop/shared/types";

type Opt = { meters: number; seconds: number };

// Lets the rider choose between fastest and shortest drivable routes; the fare follows the chosen route.
export default function RouteChoice({ pickup, dropoff, stops, value, onChange, fare }: { fare?: number; pickup: Point; dropoff: Point; stops: Point[]; value: number; onChange: (i: number) => void }) {
  const [opts, setOpts] = useState<Opt[]>([]);
  const key = JSON.stringify([pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, stops.map((s) => [s.lat, s.lng])]);
  useEffect(() => {
    let live = true;
    api<{ routes: Opt[] }>("/api/routes/alternatives", { pickup, dropoff, stops })
      .then((r) => live && setOpts(r.routes ?? []))
      .catch(() => live && setOpts([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (opts.length < 2) return null;
  const fastest = Math.min(...opts.map((o) => o.seconds));
  const shortest = Math.min(...opts.map((o) => o.meters));
  const label = (o: Opt, i: number) => (o.seconds === fastest ? "Fastest" : o.meters === shortest ? "Shortest" : `Route ${i + 1}`);
  return (
    <div className="route-choice" aria-label="Route choice">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase" mb={6}>Choose your route</Text>
      <Group gap="xs" grow>
        {opts.map((o, i) => (
          <UnstyledButton key={i} type="button" onClick={() => onChange(i)} className={"route-opt" + (value === i ? " on" : "")} aria-pressed={value === i}>
            <Badge size="xs" variant={value === i ? "filled" : "light"}>{label(o, i)}</Badge>
            <Text fw={800}>{Math.ceil(o.seconds / 60)} min</Text>
            <Text size="xs" c="dimmed">{(o.meters / 1000).toFixed(1)} km{fare && opts[value] ? ` · ≈₹${Math.round((fare * o.meters) / opts[value].meters / 100)}` : ""}</Text>
          </UnstyledButton>
        ))}
      </Group>
    </div>
  );
}
