import { Badge, Card, Group, Stack, Text, ThemeIcon, UnstyledButton } from "@mantine/core";
import { IconClockHour4, IconMapPin, IconShieldCheck, IconStar } from "@tabler/icons-react";
import { money, type Ride } from "@hop/shared/types";

type Place = { lat: number; lng: number; label: string };

// Right-hand column on wide screens: quick re-booking, saved places and trust notes.
export default function RightRail({
  rides,
  saved,
  onPick,
}: {
  rides: Ride[];
  saved: { label: string; lat: number; lng: number; kind?: string }[];
  onPick: (p: Place) => void;
}) {
  const recent = rides.filter((r) => r.mine && r.status === "completed").slice(0, 3);
  return (
    <Stack gap="md" className="right-rail">
      <Card withBorder radius="lg" padding="md">
        <Group gap="xs" mb="xs"><IconClockHour4 size={18} /><Text fw={700}>Ride again</Text></Group>
        {recent.length === 0 && <Text size="sm" c="dimmed">Your completed trips show up here for one-tap rebooking.</Text>}
        <Stack gap={4}>
          {recent.map((r) => (
            <UnstyledButton key={r.id} className="place-row" p="xs" onClick={() => onPick({ lat: r.dropoff_lat, lng: r.dropoff_lng, label: r.dropoff_label })}>
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <Text size="sm" lineClamp={2}>{r.dropoff_label}</Text>
                <Badge variant="light" size="sm">{money(r.fare_paise)}</Badge>
              </Group>
            </UnstyledButton>
          ))}
        </Stack>
      </Card>
      <Card withBorder radius="lg" padding="md">
        <Group gap="xs" mb="xs"><IconMapPin size={18} /><Text fw={700}>Saved places</Text></Group>
        {saved.length === 0 && <Text size="sm" c="dimmed">Save Home or Work from the booking form.</Text>}
        <Stack gap={4}>
          {saved.slice(0, 4).map((p, i) => (
            <UnstyledButton key={i} className="place-row" p="xs" onClick={() => onPick({ lat: p.lat, lng: p.lng, label: p.label })}>
              <Text size="sm" fw={600}>{p.label}</Text>
            </UnstyledButton>
          ))}
        </Stack>
      </Card>
      <Card withBorder radius="lg" padding="md">
        <Stack gap="sm">
          {[
            [IconShieldCheck, "Verified drivers", "Vehicle and licence checked before approval."],
            [IconMapPin, "Trip tracking", "Follow your ride and share trip details with someone you trust."],
            [IconStar, "Fare estimates", "Review your route and estimated fare before requesting a ride."],
          ].map(([Icon, title, text], i) => {
            const I = Icon as typeof IconStar;
            return (
              <Group key={i} wrap="nowrap" align="flex-start" gap="sm">
                <ThemeIcon variant="light" radius="md"><I size={18} /></ThemeIcon>
                <div><Text size="sm" fw={700}>{title as string}</Text><Text size="xs" c="dimmed">{text as string}</Text></div>
              </Group>
            );
          })}
        </Stack>
      </Card>
    </Stack>
  );
}
