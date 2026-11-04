// Hop's own OpenStreetMap style, drawn from OpenFreeMap vector tiles (free, no key, no usage cap).
// Approved Nov 2026 ("Hop Map Styles" preview):
// - browse: home, search and booking. Parks, water and buildings stay as soft colour for
//   orientation; only useful places are labelled.
// - ride: a live trip. Greenery and water fade further, buildings and shop labels go, and only
//   main-road names and big landmarks remain, so the route, captain and pins stand out.
// - night: drawn dark directly instead of inverting the day map.
// The tile and font servers can be moved (for example to our own server) with
// VITE_MAP_VECTOR_URL and VITE_MAP_GLYPHS_URL.
import type { StyleSpecification, LayerSpecification, ExpressionSpecification } from "maplibre-gl";

export type HopMapMode = "browse" | "ride";

const TILES = import.meta.env.VITE_MAP_VECTOR_URL || "https://tiles.openfreemap.org/planet";
const GLYPHS = import.meta.env.VITE_MAP_GLYPHS_URL || "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const VECTOR_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const palette = (mode: HopMapMode, night: boolean) =>
  night
    ? {
        bg: "#171923", park: "#1d2a24", wood: "#1c2722", water: "#1a2740", campus: "#1f2030",
        building: "#20222e", buildingLine: "#272a38", casing: "#2b2e3d", majorCasing: "#2b2e3d",
        road: "#3a3e51", major: "#4a4f66", motorway: "#5a5574", label: "#9a9eb3", halo: "#171923",
        place: "#7c8096", poi: "#80869c", rail: "#2f3243",
      }
    : {
        bg: "#F2F2F0",
        park: mode === "ride" ? "#E4ECDF" : "#D6E8CF",
        wood: mode === "ride" ? "#E6EDE2" : "#DCEAD5",
        water: mode === "ride" ? "#D5E2EE" : "#C4DCEF",
        campus: "#ECE9F1", building: "#E6E5EC", buildingLine: "#DAD8E2", casing: "#D8D6E0",
        majorCasing: "#CBC8D6", road: "#FFFFFF", major: "#FFFFFF", motorway: "#FBE9B7",
        label: "#5E6274", halo: "#FFFFFF", place: "#8A8D9C", poi: "#6F7A70", rail: "#CFCDD8",
      };

const width = (z12: number, z15: number, z18: number): ExpressionSpecification =>
  ["interpolate", ["exponential", 1.6], ["zoom"], 12, z12, 15, z15, 18, z18];
const classIs = (...values: string[]): ExpressionSpecification => ["match", ["get", "class"], values, true, false];
const name: ExpressionSpecification = ["coalesce", ["get", "name:en"], ["get", "name"]];
const MINOR = classIs("minor", "service", "tertiary");
const MAJOR = classIs("primary", "secondary");
const FAST = classIs("trunk", "motorway");

export function hopVectorStyle(mode: HopMapMode, night: boolean): StyleSpecification {
  const c = palette(mode, night);
  const ride = mode === "ride";
  const round = { "line-cap": "round", "line-join": "round" } as const;
  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: { "background-color": c.bg } },
    { id: "wood", type: "fill", source: "osm", "source-layer": "landcover", filter: classIs("wood", "grass", "farmland"), paint: { "fill-color": c.wood } },
    { id: "park", type: "fill", source: "osm", "source-layer": "park", paint: { "fill-color": c.park } },
    { id: "campus", type: "fill", source: "osm", "source-layer": "landuse", filter: classIs("hospital", "school", "college", "university"), paint: { "fill-color": c.campus, "fill-opacity": ride ? 0.5 : 1 } },
    { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": c.water } },
    { id: "waterway", type: "line", source: "osm", "source-layer": "waterway", paint: { "line-color": c.water, "line-width": 2 } },
    ...(ride ? [] : [{ id: "building", type: "fill", source: "osm", "source-layer": "building", minzoom: 15, paint: { "fill-color": c.building, "fill-outline-color": c.buildingLine } } as LayerSpecification]),
    { id: "rail", type: "line", source: "osm", "source-layer": "transportation", filter: classIs("rail", "transit"), paint: { "line-color": c.rail, "line-width": 1.5, "line-dasharray": [3, 2] } },
    { id: "minor-casing", type: "line", source: "osm", "source-layer": "transportation", filter: MINOR, layout: round, paint: { "line-color": c.casing, "line-width": width(0.5, ride ? 4 : 5, ride ? 14 : 18) } },
    { id: "major-casing", type: "line", source: "osm", "source-layer": "transportation", filter: classIs("primary", "secondary", "trunk", "motorway"), layout: round, paint: { "line-color": c.majorCasing, "line-width": width(2, 9, 30) } },
    { id: "minor", type: "line", source: "osm", "source-layer": "transportation", filter: MINOR, layout: round, paint: { "line-color": c.road, "line-width": width(0.3, ride ? 2.6 : 3.4, ride ? 11 : 15) } },
    { id: "major", type: "line", source: "osm", "source-layer": "transportation", filter: MAJOR, layout: round, paint: { "line-color": c.major, "line-width": width(1.5, 7, 26) } },
    { id: "motorway", type: "line", source: "osm", "source-layer": "transportation", filter: FAST, layout: round, paint: { "line-color": c.motorway, "line-width": width(1.8, 8, 28) } },
    {
      id: "road-names", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: ride ? 14 : 13.5,
      ...(ride ? { filter: classIs("primary", "secondary", "trunk", "tertiary") } : {}),
      layout: { "symbol-placement": "line", "text-field": name, "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 14, 10.5, 17, 13], "text-letter-spacing": 0.02 },
      paint: { "text-color": c.label, "text-halo-color": c.halo, "text-halo-width": 1.6 },
    },
    {
      id: "places-of-interest", type: "symbol", source: "osm", "source-layer": "poi", minzoom: 14,
      filter: ride
        ? ["all", classIs("railway", "hospital", "college"), ["<=", ["get", "rank"], 4]]
        : ["all", classIs("railway", "hospital", "college", "school", "park", "place_of_worship", "stadium", "attraction", "bus"), ["<=", ["get", "rank"], 20]],
      layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 11, "text-max-width": 8 },
      paint: { "text-color": c.poi, "text-halo-color": c.halo, "text-halo-width": 1.4, "text-opacity": ride ? 0.8 : 1 },
    },
    {
      id: "area-names", type: "symbol", source: "osm", "source-layer": "place", filter: classIs("suburb", "neighbourhood", "quarter", "city", "town"),
      layout: { "text-field": name, "text-font": ["Noto Sans Bold"], "text-size": ["match", ["get", "class"], "city", 15, 11], "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 7 },
      paint: { "text-color": c.place, "text-halo-color": c.halo, "text-halo-width": 1.5, "text-opacity": ride ? 0.7 : 1 },
    },
  ];
  return { version: 8, glyphs: GLYPHS, sources: { osm: { type: "vector", url: TILES } }, layers };
}
