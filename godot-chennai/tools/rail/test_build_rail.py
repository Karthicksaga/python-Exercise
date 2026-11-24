#!/usr/bin/env python3
"""Tests of tools/rail/build_rail.py: the build.ts cases of `packages/rail/src/rail.test.ts`
("building the rail file"), translated, plus the Three.js reproduction and the Godot file.

    python3 godot-chennai/tools/rail/test_build_rail.py
"""
from __future__ import annotations

import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_rail as b  # noqa: E402


def to_lat_lng(x: float, z: float) -> tuple[float, float]:
    cos_lat = math.cos(b.ORIGIN[0] * b.DEG)
    return (b.ORIGIN[0] - z / (b.DEG * b.EARTH_RADIUS), b.ORIGIN[1] + x / (b.DEG * b.EARTH_RADIUS * cos_lat))


def node(i: int, x: float, z: float, tags: dict[str, str] | None = None) -> dict:
    lat, lng = to_lat_lng(x, z)
    out: dict = {"type": "node", "id": i, "lat": lat, "lon": lng}
    if tags:
        out["tags"] = tags
    return out


def same(a: object, c: object, path: str = "") -> str:
    """'' when two parsed JSON values match (numbers within 1e-9), else where they differ."""
    if isinstance(a, dict) and isinstance(c, dict):
        if set(a) != set(c):
            return f"{path}: keys {sorted(set(a) ^ set(c))}"
        for k in a:
            d = same(a[k], c[k], f"{path}.{k}")
            if d:
                return d
        return ""
    if isinstance(a, list) and isinstance(c, list):
        if len(a) != len(c):
            return f"{path}: length {len(a)} != {len(c)}"
        for i, (x, y) in enumerate(zip(a, c)):
            d = same(x, y, f"{path}[{i}]")
            if d:
                return d
        return ""
    if isinstance(a, (int, float)) and isinstance(c, (int, float)) and not isinstance(a, bool):
        return "" if abs(a - c) < 1e-9 else f"{path}: {a} != {c}"
    return "" if a == c else f"{path}: {a!r} != {c!r}"


class BuildingTheRailFile(unittest.TestCase):
    """rail.test.ts: describe("building the rail file")."""

    def test_chains_ways_in_order_flipping_backwards_ones(self) -> None:
        line = b.chain_ways([[(0, 0), (0, 10)], [(0, 20), (0, 10)], [(0, 20), (0, 30)]])
        self.assertEqual([p[1] for p in line], [0, 10, 20, 30])
        self.assertEqual([p[1] for p in b.chain_ways([[(0, 10), (0, 0)], [(0, 10), (0, 20)]])], [0, 10, 20])

    def test_clips_to_the_map_and_says_which_ends_run_on(self) -> None:
        bounds = b.Bounds(-100, 100, -100, 100)
        points, start_beyond, end_beyond = b.clip_line([(0, -300), (0, -50), (0, 50), (0, 80)], bounds, 20)
        self.assertEqual([p[1] for p in points], [-120, -50, 50, 80])
        self.assertTrue(start_beyond)
        self.assertFalse(end_beyond)

    def setUp(self) -> None:
        self.extract = {
            "osm3s": {"timestamp_osm_base": "2026-07-15T15:22:01Z"},
            "elements": [
                node(1, 0, -900), node(2, 0, 0), node(3, 0, 900), node(4, 0, 2500),
                node(10, 2, -500, {"railway": "station", "name": "North Halt", "name:ta": "வடக்கு"}),
                node(11, 40, 600, {"railway": "station", "name": "Very Long Official Name Central"}),
                node(12, 5, 300, {"railway": "station", "station": "subway", "name": "Metro"}),
                node(30, 0, -498), node(31, 0, 602), node(20, 5, -900), node(21, 5, 2500),
                {"type": "way", "id": 100, "nodes": [1, 2], "tags": {"railway": "rail", "usage": "main"}},
                {"type": "way", "id": 101, "nodes": [3, 2], "tags": {"railway": "rail", "usage": "main"}},
                {"type": "way", "id": 102, "nodes": [3, 4], "tags": {"railway": "rail", "usage": "main"}},
                {"type": "way", "id": 103, "nodes": [20, 21], "tags": {"railway": "rail", "usage": "main"}},
                {"type": "way", "id": 104, "nodes": [20, 21], "tags": {"railway": "rail", "name": "MRTS"}},
                {"type": "relation", "id": 500, "tags": {"route": "train", "from": "Beach", "to": "Tambaram"}, "members": [
                    {"type": "node", "ref": 30, "role": "stop"},
                    {"type": "node", "ref": 31, "role": "stop_exit_only"},
                    {"type": "way", "ref": 100, "role": ""},
                    {"type": "way", "ref": 101, "role": ""},
                    {"type": "way", "ref": 102, "role": ""},
                ]},
            ],
        }
        self.file = b.build_rail(self.extract, b.BuildOptions(
            b.Bounds(-1000, 1000, -1000, 1000),
            [b.LineSpec("south", 500, "Beach – Tambaram", "?", "?", 8, 0)],
            {"Very Long Official Name Central": ("Central", "சென்ட்ரல்")},
            margin=150,
            skip_track=lambda tags: tags.get("name") == "MRTS",
        ))
        self.line = self.file["lines"][0]
        self.path = b.RailPath.from_flat(self.line["points"])

    def test_projects_osm_coordinates_into_the_local_frame(self) -> None:
        self.assertAlmostEqual(self.line["points"][0], 0, 0)
        self.assertAlmostEqual(self.line["points"][1], -900, 0)
        self.assertIn("2026-07-15", self.file["attribution"])

    def test_snaps_stations_to_the_track_and_keeps_metro_off(self) -> None:
        stops = self.line["stops"]
        self.assertEqual([s["name"] for s in stops], ["North Halt", "Central"])
        self.assertAlmostEqual(stops[0]["s"], 402, 0)
        self.assertAlmostEqual(stops[1]["s"], 1502, 0)
        self.assertEqual(stops[1]["nameTa"], "சென்ட்ரல்")
        self.assertEqual(stops[0]["nameTa"], "வடக்கு")
        central = next(s for s in self.file["stations"] if s["name"] == "Central")
        self.assertEqual((central["x"], central["z"]), (40, 600))

    def test_puts_the_platform_away_from_the_other_track(self) -> None:
        self.assertTrue(all(s["side"] == -1 for s in self.line["stops"]))
        stop = self.line["stops"][0]
        x, _ = self.path.beside(stop["s"], stop["side"] * (b.PLATFORM_EDGE + b.PLATFORM_WIDTH / 2))
        self.assertLess(x, -3)

    def test_runs_off_the_map_at_the_south_end_only(self) -> None:
        self.assertEqual(self.line["from"], {"name": "Beach", "beyond": False})
        self.assertEqual(self.line["to"], {"name": "Tambaram", "beyond": True})
        self.assertAlmostEqual(self.path.length, 900 + 1000 + 150, 0)

    def test_leaves_out_skipped_tracks(self) -> None:
        self.assertEqual(sorted(t["id"] for t in self.file["tracks"]), [100, 101, 102, 103])

    def test_one_island_platform_where_the_tracks_run_a_few_metres_apart(self) -> None:
        def stop(side: int, s: float) -> dict:
            return {"id": "x", "name": "X", "nameTa": "எ", "s": s, "side": side, "width": 4}

        def line(i: str, points: list[float]) -> dict:
            return {"id": i, "name": "L", "points": points, "stops": [stop(-1, 500)], "from": {"name": "a", "beyond": True}, "to": {"name": "b", "beyond": True}, "headwayMinutes": 6, "offsetMinutes": 1}

        lines = [line("down", [0, 0, 0, 1000]), line("up", [12, 1000, 12, 0])]
        b.islands(lines)
        down, up = lines[0]["stops"][0], lines[1]["stops"][0]
        self.assertAlmostEqual(down["width"], 12 - 2 * b.PLATFORM_EDGE, 1)
        self.assertEqual(up["width"], down["width"])
        self.assertTrue(up.get("twin"))
        self.assertNotIn("twin", down)
        pa, pb = b.RailPath.from_flat(lines[0]["points"]), b.RailPath.from_flat(lines[1]["points"])
        offset = b.PLATFORM_EDGE + down["width"] / 2
        a = pa.beside(down["s"], down["side"] * offset)
        c = pb.beside(up["s"], up["side"] * offset)
        self.assertAlmostEqual(a[0], 6, 1)
        self.assertLess(math.hypot(a[0] - c[0], a[1] - c[1]), 0.5)
        apart = [line("down", [0, 0, 0, 1000]), line("up", [40, 1000, 40, 0])]
        b.islands(apart)
        self.assertNotIn("twin", apart[1]["stops"][0])
        self.assertEqual(apart[0]["stops"][0]["width"], 4)
        blocked = [line("down", [0, 0, 0, 1000]), line("up", [12, 1000, 12, 0])]
        b.islands(blocked, [[(6, 0), (6, 1000)]])
        self.assertNotIn("twin", blocked[1]["stops"][0])

    def test_fails_clearly_when_the_relation_is_missing(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "fetch-rail"):
            b.build_rail({"elements": []}, b.BuildOptions(b.Bounds(0, 1, 0, 1), [b.LineSpec("x", 1, "x", "a", "b", 5, 0)]))


class TheRealFiles(unittest.TestCase):
    """The port against the Three.js game's committed file, and the Godot file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.extract = b.load_extract()
        cls.godot = json.loads(b.TARGET.read_text(encoding="utf-8"))

    def test_rebuilds_the_threejs_file_value_for_value(self) -> None:
        reference = json.loads(b.THREEJS_RAIL.read_text(encoding="utf-8"))
        self.assertEqual(same(b.build_threejs(self.extract), reference), "")

    def test_the_committed_godot_file_is_up_to_date(self) -> None:
        self.assertEqual(b.TARGET.read_text(encoding="utf-8"), b.dumps(b.build_godot(self.extract)))

    def test_keeps_the_threejs_lines_and_stations_unchanged(self) -> None:
        reference = json.loads(b.THREEJS_RAIL.read_text(encoding="utf-8"))
        for old in reference["lines"]:
            new = next(line for line in self.godot["lines"] if line["id"] == old["id"])
            for key in old:
                self.assertEqual(same(new[key], old[key]), "", key)
        self.assertEqual(same(self.godot["tracks"], reference["tracks"]), "")

    def test_every_line_is_a_real_route_relation_with_stops(self) -> None:
        ids = {spec.id for spec in b.GODOT_LINES}
        for line in self.godot["lines"]:
            self.assertIn(line["id"], ids)
            self.assertGreater(len(line["stops"]), 0, line["id"])
            for stop in line["stops"]:
                self.assertTrue(stop["nameTa"], f"{line['id']} {stop['name']} has a Tamil name")

    def test_no_two_lines_trains_meet_on_shared_track(self) -> None:
        self.assertEqual(b.conflicts(self.godot["lines"], 4.0), [])

    def test_the_mrts_runs_on_its_viaduct(self) -> None:
        for line in self.godot["lines"]:
            if line.get("system") != "mrts":
                self.assertNotIn("heights", line)
                continue
            h = line["heights"]
            self.assertEqual(len(h), len(line["points"]) // 2)
            self.assertGreater(sum(1 for v in h if v >= b.VIADUCT_HEIGHT - 0.01) / len(h), 0.5)
            path = b.RailPath.from_flat(line["points"])
            for i in range(1, len(h)):
                run = path.lengths[i] - path.lengths[i - 1]
                self.assertLessEqual(abs(h[i] - h[i - 1]), run * b.VIADUCT_GRADE + 0.11, f"{line['id']} grade at {i}")
            # Every MRTS stop is on the viaduct.
            for stop in line["stops"]:
                i = max(0, min(len(h) - 1, path._segment(stop["s"])))
                self.assertGreaterEqual(min(h[i], h[min(i + 1, len(h) - 1)]), b.VIADUCT_HEIGHT - 0.01, stop["name"])

    def test_level_crossings_lie_on_drawn_tracks(self) -> None:
        tracks = [b.RailPath.from_flat(t["points"]).points for t in self.godot["tracks"]]
        self.assertGreater(len(self.godot["crossings"]), 0)
        for c in self.godot["crossings"]:
            self.assertLess(min(b.distance_to_polyline((c["x"], c["z"]), t) for t in tracks), 3.01)


if __name__ == "__main__":
    unittest.main(verbosity=1)
