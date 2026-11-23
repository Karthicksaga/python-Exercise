/** The committed railway file (`world/rail.json`) against the real city map. */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EMU_MOTION, RailNetwork, platformOf, type RailFile } from "@cow/rail";

const world = resolve(__dirname, "../public/world");
const file = JSON.parse(readFileSync(resolve(world, "rail.json"), "utf8")) as RailFile;
const bounds = (JSON.parse(readFileSync(resolve(world, "index.json"), "utf8")) as { bounds: { minX: number; maxX: number; minZ: number; maxZ: number } }).bounds;
const network = new RailNetwork(file);

/**
 * Characters `assets/fonts/noto-sans-tamil-stations.woff2` was cut to (pyftsubset, see
 * assets/README.md). If a station's Tamil name changes, re-cut the font and update this list.
 */
const STATION_GLYPHS = "பூங்காசெனை எழுமரேதடநோலிண";
/**
 * Characters `assets/fonts/noto-sans-devanagari-stations.woff2` was cut to (pyftsubset, see
 * assets/README.md). If a station's Hindi name changes, re-cut the font and update this list.
 */
const HINDI_GLYPHS = " ंईउएकगचटडथदनपबमरलसािीुेैॉो्";

describe("the railway file", () => {
  it("is small", () => {
    expect(statSync(resolve(world, "rail.json")).size).toBeLessThan(80_000);
    expect(file.attribution).toContain("OpenStreetMap");
  });

  it("has the Beach–Tambaram line both ways, running off the map at both ends", () => {
    const down = network.line("beach-tambaram")!;
    const up = network.line("tambaram-beach")!;
    expect(down.from).toEqual({ name: "Chennai Beach", beyond: true });
    expect(down.to).toEqual({ name: "Tambaram", beyond: true });
    expect(up.to.name).toBe("Chennai Beach");
    const names = down.stops.map((s) => s.name);
    expect(names).toEqual(["Park", "Chennai Egmore", "Chetpet", "Nungambakkam", "Kodambakkam", "Mambalam", "Saidapet", "Guindy", "St. Thomas Mount"]);
    expect(up.stops.map((s) => s.name)).toEqual([...names].reverse());
  });

  it("puts every station on the map, on its line, with a Tamil name the board font can draw", () => {
    for (const line of network.lines) {
      for (const stop of line.stops) {
        const p = platformOf(line, stop);
        expect(p.x).toBeGreaterThan(bounds.minX);
        expect(p.x).toBeLessThan(bounds.maxX);
        expect(p.z).toBeGreaterThan(bounds.minZ);
        expect(p.z).toBeLessThan(bounds.maxZ);
        const station = network.station(stop.id)!;
        // The OSM station node lies near the line (it is often in the station building).
        expect(line.path.project(station).distance).toBeLessThan(400);
        expect(stop.nameTa.length).toBeGreaterThan(0);
        for (const ch of stop.nameTa) expect(STATION_GLYPHS).toContain(ch);
      }
    }
  });

  it("gives every station a Hindi name the board font can draw", () => {
    for (const station of file.stations) {
      expect(station.nameHi?.length ?? 0).toBeGreaterThan(0);
      for (const ch of station.nameHi ?? "") expect(HINDI_GLYPHS).toContain(ch);
    }
  });

  it("runs a few trains at a time and the whole line takes about half an hour", () => {
    for (const line of network.lines) {
      expect(line.profile.duration / 60).toBeGreaterThan(20);
      expect(line.profile.duration / 60).toBeLessThan(45);
      const trains = line.trains(5 * 3600);
      expect(trains.length).toBeGreaterThan(1);
      expect(trains.length).toBeLessThanOrEqual(6);
      // Each stop takes the full dwell.
      expect(line.profile.phases.filter((p) => p.stop !== undefined).every((p) => p.duration === EMU_MOTION.dwell)).toBe(true);
    }
  });
});
