import { ActionIcon, Button, Group, Paper, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { IconCurrentLocation, IconMapPin, IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@hop/shared/api";
import type { Point } from "@hop/shared/types";
import { useReverseGeocode } from "./MapPicker";
export default function PlaceInput({
  label,
  area,
  value,
  onChange,
  current = false,
  scope,
}: {
  label: string;
  area: string;
  value: Point | null;
  onChange: (p: Point | null) => void;
  current?: boolean;
  scope?: "india";
}) {
  const [text, setText] = useState(value?.label || ""),
    [places, setPlaces] = useState<Point[]>([]),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  const request = useRef(0);
  const reverse = useReverseGeocode();
  useEffect(() => {
    if (value) setText(value.label);
    setPlaces([]);
  }, [value]);
  const abort = useRef<AbortController | null>(null);
  function search(q: string) {
    const version = ++request.current;
    abort.current?.abort();
    const controller = (abort.current = new AbortController());
    setSearching(true);
    api<Point[]>(
      `/api/places?area_id=${encodeURIComponent(area)}&q=${encodeURIComponent(q)}${scope ? `&scope=${scope}` : ""}`,
      undefined,
      controller.signal,
    )
      .then((p) => {
        if (version === request.current) {
          setPlaces(p);
          setError(p.length ? "" : "No matching addresses inside this service area.");
        }
      })
      .catch((e) => {
        if (e.name !== "AbortError" && version === request.current) setError(e.message);
      })
      .finally(() => {
        if (version === request.current) setSearching(false);
      });
  }
  useEffect(() => {
    if (text.length < 3 || !area || text === value?.label) {
      request.current++;
      setPlaces([]);
      return;
    }
    const timer = setTimeout(() => search(text), 350);
    return () => {
      clearTimeout(timer);
      abort.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, area, value, scope]);
  function submit() {
    const q = text.trim();
    if (q.length < 3) {
      setError("Type at least 3 letters to search.");
      return;
    }
    setError("");
    search(q);
  }
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Search for your pickup.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        if (p.coords.accuracy > 100) {
          setError("Location is not accurate enough. Search for your pickup.");
          return;
        }
        const { latitude: lat, longitude: lng } = p.coords;
        onChange({ lat, lng, label: await reverse(lat, lng) });
      },
      (positionError) =>
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission is blocked for localhost. Allow it in browser site settings, then reload."
            : "Could not determine your location. Search for your pickup or tap the map.",
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  return (
    <Stack gap={6} className="place-field" mb="sm">
      <TextInput
        label={label}
        value={text}
        size="md"
        placeholder={area ? "Search an address or landmark" : "Choose a service area first"}
        disabled={!area}
        autoComplete="off"
        enterKeyHint="search"
        leftSection={<IconSearch size={18} />}
        rightSectionWidth={text ? 128 : 90}
        rightSectionPointerEvents="all"
        rightSection={
          <Group gap={4} wrap="nowrap" mr={4}>
            {text && (
              <ActionIcon variant="light" color="gray" radius="xl" aria-label="Clear" onClick={() => { onChange(null); setText(""); setPlaces([]); setError(""); }}>
                <IconX size={14} />
              </ActionIcon>
            )}
            <Button size="compact-md" disabled={!area || !text.trim()} onClick={submit}>Search</Button>
          </Group>
        }
        onChange={(e) => {
          onChange(null);
          setText(e.currentTarget.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (places.length) {
            onChange(places[0]);
            setPlaces([]);
          } else submit();
        }}
      />
      {current && (
        <Button variant="subtle" size="compact-sm" w="fit-content" leftSection={<IconCurrentLocation size={16} />} disabled={!area} onClick={locate}>
          Use my current location
        </Button>
      )}
      {searching && <Text size="xs" c="dimmed">Searching addresses…</Text>}
      {error && <Text size="xs" c="red" role="status">{error}</Text>}
      {places.length > 0 && (
        <Paper withBorder shadow="md" p={4} className="places-list">
          {places.map((p, i) => (
            <UnstyledButton
              key={i}
              w="100%"
              px="sm"
              py={8}
              className="place-row"
              onClick={() => { onChange(p); setPlaces([]); setError(""); }}
            >
              <Group gap="sm" wrap="nowrap" align="flex-start">
                <IconMapPin size={18} style={{ flex: "none", marginTop: 2 }} color="var(--mantine-color-hop-7)" />
                <Text size="sm">{p.label}</Text>
              </Group>
            </UnstyledButton>
          ))}
        </Paper>
      )}
    </Stack>
  );
}
