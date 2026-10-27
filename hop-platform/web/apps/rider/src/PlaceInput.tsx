import {
  ActionIcon,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowLeft,
  IconCurrentLocation,
  IconMapPin,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
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
  const listId = useId();
  const [activeOption, setActiveOption] = useState(-1);
  const isMobile = useMediaQuery("(max-width: 820px)");
  const [text, setText] = useState(value?.label || "");
  const [places, setPlaces] = useState<Point[]>([]);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [locating, setLocating] = useState(false);

  const request = useRef(0);
  const reverse = useReverseGeocode();
  const abort = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setText(value.label);
    else setText("");
    setPlaces([]);
  }, [value]);

  // Click outside listener for desktop floating dropdown
  useEffect(() => {
    if (isMobile) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setPlaces([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobile]);

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
          setPlaces(p); setActiveOption(-1);
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
    const timer = setTimeout(() => search(text), 300);
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

  function handleSelectPlace(p: Point) {
    onChange(p);
    setText(p.label);
    setPlaces([]);
    setError("");
    setMobileModalOpen(false);
  }

  function handleClear() {
    onChange(null);
    setText("");
    setPlaces([]);
    setError("");
  }

  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location is unavailable in this browser. Search for your pickup.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (p) => {
        try {
          if (p.coords.accuracy > 150) {
            setError("Location is not accurate enough. Search for your pickup or pick on map.");
            setLocating(false);
            return;
          }
          const { latitude: lat, longitude: lng } = p.coords;
          const address = await reverse(lat, lng);
          const pt: Point = { lat, lng, label: address };
          handleSelectPlace(pt);
        } catch (e) {
          setError((e as Error).message || "Failed to reverse geocode location.");
        } finally {
          setLocating(false);
        }
      },
      (positionError) => {
        setLocating(false);
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission is blocked. Allow it in browser or app settings, or search below."
            : "Could not determine your location. Search for your pickup or tap the map.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <Stack gap={6} className="place-field" mb="sm">
        <TextInput
          label={label}
          role="combobox" aria-autocomplete="list" aria-expanded={!isMobile && places.length>0}
          aria-controls={!isMobile && places.length ? listId : undefined}
          aria-activedescendant={!isMobile && activeOption>=0 ? `${listId}-${activeOption}` : undefined}
          value={text}
          size="md"
          radius="md"
          placeholder={area ? "Search an address or landmark" : "Choose a service area first"}
          disabled={!area}
          autoComplete="off"
          enterKeyHint="search"
          onClick={() => {
            if (isMobile) setMobileModalOpen(true);
          }}
          leftSection={<IconSearch size={18} />}
          rightSectionWidth={text ? 108 : 80}
          rightSectionPointerEvents="all"
          rightSection={
            <Group gap={4} wrap="nowrap" mr={4}>
              {text && (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  size="sm"
                  aria-label="Clear"
                  onClick={handleClear}
                >
                  <IconX size={14} />
                </ActionIcon>
              )}
              <Button
                size="compact-sm"
                radius="sm"
                disabled={!area || !text.trim()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isMobile) {
                    setMobileModalOpen(true);
                    submit();
                  } else {
                    submit();
                  }
                }}
              >
                Search
              </Button>
            </Group>
          }
          onChange={(e) => {
            setText(e.currentTarget.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setPlaces([]); setActiveOption(-1); return; }
            if ((e.key === "ArrowDown" || e.key === "ArrowUp") && places.length) {
              e.preventDefault(); setActiveOption(i => (i + (e.key === "ArrowDown" ? 1 : -1) + places.length)%places.length); return;
            }
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (places.length) {
              handleSelectPlace(places[Math.max(0,activeOption)]);
            } else {
              submit();
            }
          }}
        />

        {current && (
          <Button
            variant="subtle"
            size="compact-sm"
            w="fit-content"
            loading={locating}
            leftSection={<IconCurrentLocation size={16} />}
            disabled={!area}
            onClick={locate}
          >
            Use my current location
          </Button>
        )}

        {searching && !isMobile && <Text size="xs" c="dimmed" role="status">Searching addresses…</Text>}
        {error && !isMobile && <Text size="xs" c="red" role="status">{error}</Text>}

        {/* Desktop floating dropdown */}
        {!isMobile && places.length > 0 && (
          <Paper
            withBorder
            shadow="lg"
            p={6}
            className="places-list desktop-dropdown" id={listId} role="listbox" aria-label={`${label} suggestions`}
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 1000,
              maxHeight: 280,
              overflowY: "auto",
              borderRadius: 14,
            }}
          >
            {places.map((p, i) => (
              <UnstyledButton
                key={i} id={`${listId}-${i}`} role="option" aria-selected={activeOption===i} tabIndex={-1}
                w="100%"
                px="sm"
                py={10}
                className="place-row"
                onClick={() => handleSelectPlace(p)}
                style={{
                  borderRadius: 8,
                  background: activeOption===i ? "var(--brand-soft)" : undefined,
                  transition: "background 0.15s ease",
                }}
              >
                <Group gap="sm" wrap="nowrap" align="center">
                  <ThemeIcon size="md" radius="xl" color="brand" variant="light">
                    <IconMapPin size={16} />
                  </ThemeIcon>
                  <Stack gap={0} style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={600} truncate>
                      {p.label.split(",")[0]}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {p.label}
                    </Text>
                  </Stack>
                </Group>
              </UnstyledButton>
            ))}
          </Paper>
        )}
      </Stack>

      {/* Mobile Search Overlay / Bottom Sheet */}
      {isMobile && (
        <Modal
          opened={mobileModalOpen}
          onClose={() => setMobileModalOpen(false)}
          fullScreen
          transitionProps={{ transition: "slide-up", duration: 250 }}
          padding={0}
          withCloseButton={false}
          zIndex={2000}
        >
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100dvh",
              background: "var(--card)",
            }}
          >
            {/* Header with back button and search input */}
            <Box
              p="md"
              style={{
                borderBottom: "1px solid var(--line)",
                paddingTop: "max(16px, env(safe-area-inset-top, 16px))",
                background: "var(--card)",
              }}
            >
              <Group gap="sm" wrap="nowrap" align="center">
                <ActionIcon
                  variant="subtle"
                  size="lg"
                  radius="xl"
                  aria-label="Back"
                  onClick={() => setMobileModalOpen(false)}
                >
                  <IconArrowLeft size={22} />
                </ActionIcon>
                <TextInput
                  data-autofocus
                  aria-label={`Search ${label.toLowerCase()}`}
                  autoFocus
                  style={{ flex: 1 }}
                  size="md"
                  radius="md"
                  value={text}
                  placeholder={`Search ${label.toLowerCase()}...`}
                  leftSection={<IconSearch size={18} />}
                  rightSection={
                    text ? (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        radius="xl"
                        size="sm"
                        aria-label="Clear text"
                        onClick={() => {
                          setText("");
                          setPlaces([]);
                          setError("");
                        }}
                      >
                        <IconX size={16} />
                      </ActionIcon>
                    ) : undefined
                  }
                  onChange={(e) => {
                    setText(e.currentTarget.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (places.length) {
                        handleSelectPlace(places[0]);
                      } else {
                        submit();
                      }
                    }
                  }}
                />
                <Button
                  size="md"
                  radius="md"
                  disabled={!text.trim() || text.trim().length < 3}
                  onClick={submit}
                >
                  Search
                </Button>
              </Group>
            </Box>

            {/* Quick Actions (e.g. Current Location) */}
            {current && (
              <Box px="md" py="sm" style={{ borderBottom: "1px solid var(--line)" }}>
                <UnstyledButton
                  w="100%"
                  py={8}
                  px={10}
                  onClick={locate}
                  style={{
                    borderRadius: 10,
                    background: "var(--brand-soft)",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <ThemeIcon size="lg" radius="xl" color="brand" variant="filled">
                    {locating ? <Loader size="xs" color="white" /> : <IconCurrentLocation size={20} />}
                  </ThemeIcon>
                  <Box style={{ flex: 1 }}>
                    <Text size="sm" fw={700} c="brand">
                      {locating ? "Detecting current location…" : "Use my current location"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      GPS fix within your active service area
                    </Text>
                  </Box>
                </UnstyledButton>
              </Box>
            )}

            {/* Status and Feedback */}
            {searching && (
              <Group px="md" py="sm" gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Searching addresses in service area…
                </Text>
              </Group>
            )}

            {error && (
              <Box px="md" py="sm">
                <Text size="sm" c="red" fw={500}>
                  {error}
                </Text>
              </Box>
            )}

            {/* Results list */}
            <Box
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px 16px max(16px, env(safe-area-inset-bottom, 16px))",
              }}
            >
              {places.length > 0 ? (
                <Stack gap={8}>
                  {places.map((p, i) => (
                    <UnstyledButton
                      key={i}
                      w="100%"
                      p="sm"
                      onClick={() => handleSelectPlace(p)}
                      style={{
                        borderRadius: 14,
                        border: "1px solid var(--line)",
                        background: "var(--card)",
                        boxShadow: "0 2px 6px rgba(0, 0, 0, 0.04)",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        minHeight: 56,
                      }}
                    >
                      <ThemeIcon
                        size="md"
                        radius="xl"
                        color="brand"
                        variant="light"
                        style={{ marginTop: 2, flexShrink: 0 }}
                      >
                        <IconMapPin size={18} />
                      </ThemeIcon>
                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Text size="sm" fw={700} truncate>
                          {p.label.split(",")[0]}
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={2} style={{ lineHeight: 1.3 }}>
                          {p.label}
                        </Text>
                      </Box>
                    </UnstyledButton>
                  ))}
                </Stack>
              ) : (
                !searching && (
                  <Box py={40} style={{ textAlign: "center", color: "var(--muted)" }}>
                    <ThemeIcon size={48} radius="xl" variant="light" color="gray" mb="sm">
                      <IconSearch size={24} />
                    </ThemeIcon>
                    <Text size="sm" fw={600}>
                      Type an address, area or landmark
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Addresses inside the active service area will appear here
                    </Text>
                  </Box>
                )
              )}
            </Box>
          </Box>
        </Modal>
      )}
    </div>
  );
}
