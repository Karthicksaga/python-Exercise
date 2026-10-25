import { useEffect, useState } from "react";
import { Badge, Card, Group, Progress, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconClock, IconMapPin, IconRoute, IconStar, IconWallet } from "@tabler/icons-react";
import { api } from "@hop/shared/api";
import { money } from "@hop/shared/types";

type Totals = {
  trips: number; meters: number; trip_seconds: number; avg_fare_paise: number; fare_per_km_paise: number;
  avg_pickup_seconds: number; avg_rating: number | null; rated: number; best_fare_paise: number; pink_trips: number;
};
type Trip = {
  id: string; completed_at: string; pickup_label: string; dropoff_label: string; trip_type: string; vehicle_category: string;
  pink: boolean; meters: number; est_seconds: number; fare_paise: number; payment_method: string; payment_status: string;
  rating: number | null; pickup_seconds: number | null; trip_seconds: number | null;
};
type Insights = {
  totals: Totals[];
  days: { day: string; trips: number; fare_paise: number; meters: number }[];
  areas: { area: string; trips: number; fare_paise: number }[];
  methods: { method: string; trips: number; fare_paise: number }[];
  types: { trip_type: string; trips: number; fare_paise: number; meters: number }[];
  peak_hours: { hour: number; trips: number }[];
  trips: Trip[];
};

const km = (m: number) => `${(m / 1000).toFixed(1)} km`;
const dur = (s: number | null | undefined) => {
  if (!s || s < 1) return "—";
  const m = Math.round(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.max(1, m)} min`;
};
const hour = (h: number) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
const payLabel = (s: string) =>
  s === "driver_reported_received" ? "Reported paid" : s === "paid_online" ? "Paid online" : s === "rider_disputed" ? "Disputed" : "Unconfirmed";

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card withBorder radius="lg" padding="md">
      <Group gap={8} mb={4} c="dimmed">{icon}<Text size="xs" fw={600} tt="uppercase">{label}</Text></Group>
      <Text fz={22} fw={800}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Card>
  );
}

// Driver trip analytics: time, distance, areas, payment mix and per-trip detail.
export default function DriverInsights({ refreshKey }: { refreshKey?: unknown }) {
  const [d, setD] = useState<Insights | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<Insights>("/api/drivers/insights").then(setD).catch((e: Error) => setErr(e.message));
  }, [refreshKey]);
  if (err) return <Text c="red" size="sm">Could not load trip insights: {err}</Text>;
  if (!d) return null;
  const t = d.totals?.[0];
  if (!t) return null;
  const maxDay = Math.max(1, ...d.days.map((x) => x.fare_paise));
  const maxArea = Math.max(1, ...d.areas.map((x) => x.trips));
  return (
    <Stack gap="md" mt="md" className="insights">
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
        <Stat icon={<IconRoute size={16} />} label="Distance driven" value={km(t.meters)} sub={`${t.trips} trips`} />
        <Stat icon={<IconClock size={16} />} label="Time on trips" value={dur(t.trip_seconds)} sub={`Avg pickup ${dur(t.avg_pickup_seconds)}`} />
        <Stat icon={<IconWallet size={16} />} label="Avg fare" value={money(t.avg_fare_paise)} sub={`${money(t.fare_per_km_paise)} per km · best ${money(t.best_fare_paise)}`} />
        <Stat icon={<IconStar size={16} />} label="Rider rating" value={t.avg_rating ? `${t.avg_rating} ★` : "No ratings yet"} sub={`${t.rated} rated${t.pink_trips ? ` · ${t.pink_trips} pink` : ""}`} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
        <Card withBorder radius="lg" padding="md">
          <Title order={4} mb="xs">Last 7 days</Title>
          {d.days.length === 0 && <Text size="sm" c="dimmed">No trips this week.</Text>}
          <Stack gap={6}>
            {d.days.map((x) => (
              <div key={x.day}>
                <Group justify="space-between"><Text size="xs">{new Date(x.day).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</Text>
                  <Text size="xs" fw={600}>{money(x.fare_paise)} · {x.trips} trips · {km(x.meters)}</Text></Group>
                <Progress value={(x.fare_paise / maxDay) * 100} size="sm" radius="xl" />
              </div>
            ))}
          </Stack>
        </Card>
        <Card withBorder radius="lg" padding="md">
          <Group gap={6} mb="xs"><IconMapPin size={18} /><Title order={4}>Where you travelled</Title></Group>
          <Stack gap={6}>
            {d.areas.map((x) => (
              <div key={x.area}>
                <Group justify="space-between"><Text size="xs">{x.area || "Unknown"}</Text><Text size="xs" fw={600}>{x.trips} drops · {money(x.fare_paise)}</Text></Group>
                <Progress value={(x.trips / maxArea) * 100} size="sm" radius="xl" color="teal" />
              </div>
            ))}
          </Stack>
          <Group gap={6} mt="md" wrap="wrap">
            {d.peak_hours.length > 0 && <Text size="xs" c="dimmed">Busiest hours:</Text>}
            {d.peak_hours.map((h) => <Badge key={h.hour} variant="light">{hour(h.hour)} · {h.trips}</Badge>)}
          </Group>
          <Group gap={6} mt="xs" wrap="wrap">
            {d.methods.map((m) => <Badge key={m.method} variant="outline" color="gray">{m.method.toUpperCase()} {money(m.fare_paise)} ({m.trips})</Badge>)}
            {d.types.map((m) => <Badge key={m.trip_type} variant="outline" color="grape">{m.trip_type} {m.trips}</Badge>)}
          </Group>
        </Card>
      </SimpleGrid>

      <Title order={4}>Trip details</Title>
      {d.trips.length === 0 && <Text size="sm" c="dimmed">Completed trips will appear here.</Text>}
      <Stack gap="xs">
        {d.trips.map((r) => (
          <Card key={r.id} withBorder radius="md" padding="sm">
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div style={{ minWidth: 0 }}>
                <Text size="xs" c="dimmed">{new Date(r.completed_at).toLocaleString("en-IN")}</Text>
                <Text size="sm" lineClamp={1}>● {r.pickup_label}</Text>
                <Text size="sm" lineClamp={1}>■ {r.dropoff_label}</Text>
              </div>
              <div style={{ textAlign: "right", flex: "none" }}>
                <Text fw={800}>{money(r.fare_paise)}</Text>
                <Text size="xs" c="dimmed">{payLabel(r.payment_status)}</Text>
              </div>
            </Group>
            <Group gap={6} mt={8} wrap="wrap">
              <Badge variant="light" color="gray">{km(r.meters)}</Badge>
              <Badge variant="light" color="gray">Trip {dur(r.trip_seconds)} (est. {dur(r.est_seconds)})</Badge>
              <Badge variant="light" color="gray">Pickup wait {dur(r.pickup_seconds)}</Badge>
              <Badge variant="light">{r.vehicle_category}</Badge>
              {r.trip_type !== "city" && <Badge variant="light" color="grape">{r.trip_type}</Badge>}
              {r.pink && <Badge color="pink">Pink</Badge>}
              <Badge variant="outline" color="gray">{r.payment_method.toUpperCase()}</Badge>
              {r.rating ? <Badge color="yellow" variant="light">{r.rating} ★ from rider</Badge> : null}
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
