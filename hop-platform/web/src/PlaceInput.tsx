import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Point } from "./types";
export default function PlaceInput({
  label,
  area,
  value,
  onChange,
  current = false,
}: {
  label: string;
  area: string;
  value: Point | null;
  onChange: (p: Point | null) => void;
  current?: boolean;
}) {
  const [text, setText] = useState(value?.label || ""),
    [places, setPlaces] = useState<Point[]>([]),
    [error, setError] = useState(""),
    [searching, setSearching] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    if (value) setText(value.label);
    setPlaces([]);
  }, [value]);
  useEffect(() => {
    const version = ++request.current;
    if (text.length < 3 || !area || text === value?.label) {
      setPlaces([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      api<Point[]>(
        `/api/places?area_id=${encodeURIComponent(area)}&q=${encodeURIComponent(text)}`,
        undefined,
        controller.signal,
      )
        .then((p) => {
          if (version === request.current) {
            setPlaces(p);
            setError(
              p.length ? "" : "No matching addresses inside this service area.",
            );
          }
        })
        .catch((e) => {
          if (e.name !== "AbortError" && version === request.current)
            setError(e.message);
        })
        .finally(() => {
          if (version === request.current) setSearching(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, area, value]);
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError(
        "Location is unavailable in this browser. Search for your pickup.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (p.coords.accuracy > 100) {
          setError("Location is not accurate enough. Search for your pickup.");
          return;
        }
        onChange({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          label: "My current location",
        });
      },
      () =>
        setError(
          "Location permission was denied or unavailable. Search for your pickup.",
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }
  return (
    <div className="place-field">
      <label>
        {label}
        <input
          value={text}
          placeholder={
            area
              ? "Search an address or landmark"
              : "Choose a service area first"
          }
          disabled={!area}
          onChange={(e) => {
            const t = e.target.value;
            onChange(null);
            setText(t);
            setError("");
          }}
          autoComplete="off"
        />
      </label>
      {current && (
        <button
          className="text-button"
          type="button"
          disabled={!area}
          onClick={locate}
        >
          ◎ Use my current location
        </button>
      )}
      {searching && <small>Searching addresses…</small>}
      {error && <small role="status">{error}</small>}
      {places.length > 0 && (
        <ul className="places">
          {places.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onChange(p);
                  setPlaces([]);
                  setError("");
                }}
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
