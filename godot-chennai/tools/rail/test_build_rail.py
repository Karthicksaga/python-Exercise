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


class TheRegionalSteps(unittest.TestCase):
    """G-460, G-461: the regional extract's steps on small made-up networks."""

    def test_the_extract_keeps_railway_drops_plans_and_cuts_tags(self) -> None:
        import extract_rail as e

        nodes = {1: (13.0, 80.0, {}), 2: (13.001, 80.0, {}), 3: (13.002, 80.0, {"railway": "level_crossing"}),
                 10: (13.0005, 80.0002, {"railway": "station", "name": "A", "operator": "dropped", "wheelchair": "yes"}),
                 20: (13.01, 80.01, {}), 21: (13.0101, 80.01, {}), 22: (13.0101, 80.0101, {}), 23: (13.01, 80.0101, {}),
                 30: (13.02, 80.02, {"amenity": "cafe"})}
        ways = {100: ([1, 2, 3], {"railway": "rail", "maxspeed": "80", "bridge": "yes"}),
                101: ([20, 21, 22, 23, 20], {"railway": "station", "name": "Area Halt"}),
                102: ([1, 2], {"highway": "primary"})}
        relations = {500: ([("w", 100, ""), ("n", 10, "stop")], {"route": "train", "name": "L", "operator": "x"}),
                     501: ([("w", 100, "")], {"route": "subway", "name": "Line 3 (u/c)"}),
                     502: ([("w", 102, "")], {"route": "bus", "name": "B"})}
        doc = e.assemble(nodes, ways, relations, "2026-11-23T00:00:00Z")
        by = {(x["type"], x["id"]): x for x in doc["elements"]}
        self.assertIn(("relation", 500), by)
        self.assertNotIn(("relation", 501), by, "under construction")
        self.assertNotIn(("relation", 502), by, "not a railway route")
        self.assertEqual(by[("way", 100)]["tags"], {"railway": "rail", "bridge": "yes"})
        self.assertNotIn(("way", 102), by)
        self.assertNotIn(("node", 30), by)
        self.assertEqual(by[("node", 10)]["tags"], {"railway": "station", "name": "A"})
        self.assertIn(("node", 3), by, "level crossings kept")
        area = by[("node", -101)]
        self.assertEqual(area["tags"]["name"], "Area Halt")
        self.assertAlmostEqual(area["lat"], 13.01005, 6)
        self.assertEqual(by[("relation", 500)]["members"][1], {"type": "node", "ref": 10, "role": "stop"})

    def test_route_path_follows_the_track_whatever_the_order_and_both_tracks(self) -> None:
        # A double line A..E listed out of order, with its stops on both tracks: the path runs from
        # the first stop to the last once, never round the loop the two tracks make.
        local = {}
        down = []
        up = []
        for i in range(11):
            local[i] = (0.0, -1000.0 * i)
            local[100 + i] = (5.0, -1000.0 * i)
            down.append(i)
            up.append(100 + i)
        local[200] = (2.5, 500.0)  # both tracks meet south of the first stop
        ways = [
            {"id": 3, "nodes": down[5:]}, {"id": 1, "nodes": [200] + down[:6]},
            {"id": 2, "nodes": [200] + up[:6]}, {"id": 4, "nodes": up[5:]},
        ]
        stops = [(0.0, -500.0), (5.0, -5500.0), (0.0, -9500.0)]
        line = b.route_path(ways, local, stops, True)
        path = b.RailPath(line)
        self.assertLess(path.length, 12000, "no loop round both tracks")
        self.assertGreater(path.length, 9000)
        self.assertLess(path.project((0, -9500))[0], path.length + 1)
        self.assertGreater(path.project((0, -9500))[0], path.project((0, -500))[0], "runs from the first stop to the last")

    def test_keep_left_moves_a_head_on_line_onto_its_left_track_or_a_second_one(self) -> None:
        # An earlier line runs north on x = 0. A later line south on the same centre line moves to
        # the track 5 m to its left (east, x = 5) where there is one, else 4.8 m on its own.
        earlier = [[0.0, 0.0, 0.0, -2000.0]]
        tracks = [[(0.0, 0.0), (0.0, -2000.0)], [(5.0, -1000.0), (5.0, -2000.0)]]
        points, second = b.keep_left([(0.0, -2000.0), (0.0, 0.0)], earlier, tracks)
        path = b.RailPath(points)
        self.assertAlmostEqual(path.at(300)[0], 5.0, 1, "on the mapped left track")
        self.assertAlmostEqual(path.at(1700)[0], b.SECOND_TRACK, 1, "on the estimated second track")
        self.assertEqual(len(second), 1)
        self.assertTrue(all(abs(x - b.SECOND_TRACK) < 0.01 for x, _ in second[0]))
        same, none = b.keep_left([(0.0, 0.0), (0.0, -2000.0)], earlier, tracks)
        self.assertEqual(same, [(0.0, 0.0), (0.0, -2000.0)], "the same direction stays")
        self.assertEqual(none, [])

    def test_viaduct_and_tunnel_heights_ramp_at_the_grade(self) -> None:
        local = {1: (0.0, 0.0), 2: (0.0, -1000.0), 3: (0.0, -1600.0), 4: (0.0, -3000.0)}
        ways = [{"nodes": [1, 2], "tags": {"bridge": "yes", "layer": "1"}}, {"nodes": [2, 3], "tags": {}},
                {"nodes": [3, 4], "tags": {"tunnel": "yes", "layer": "-1"}}]
        pts = [(0.0, -float(z)) for z in range(0, 3001, 50)]
        dense, h = b.viaduct_heights(pts, [400.0, 2600.0], ways, local, b.METRO_VIADUCT_HEIGHT, b.METRO_TUNNEL_DEPTH, b.METRO_GRADE)
        path = b.RailPath(dense)
        at = lambda s: h[path._segment(s)]
        self.assertEqual(at(400), b.METRO_VIADUCT_HEIGHT)
        self.assertEqual(at(2600), b.METRO_TUNNEL_DEPTH)
        for i in range(1, len(h)):
            self.assertLessEqual(abs(h[i] - h[i - 1]), (path.lengths[i] - path.lengths[i - 1]) * b.METRO_GRADE + 0.11)


# The MRTS stops the Godot file had inside the old (Three.js) box, all on the viaduct (G-323).
MRTS_OLD_BOX = {"Park Town", "Chintadaripet", "Chepauk", "Thiruvallikeni", "Light House", "Mundakakanni Amman Koil", "Thirumayilai",
                "Mandaveli", "Greenways Road", "Kotturpuram", "Kasturiba Nagar", "Indira Nagar", "Tiruvanmiyur"}


class TheRealFiles(unittest.TestCase):
    """The port against the Three.js game's committed file, and the Godot file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.extract = b.load_extract()
        cls.regional = b.load_regional()
        cls.godot = json.loads(b.TARGET.read_text(encoding="utf-8"))

    def test_rebuilds_the_threejs_file_value_for_value(self) -> None:
        reference = json.loads(b.THREEJS_RAIL.read_text(encoding="utf-8"))
        self.assertEqual(same(b.build_threejs(self.extract), reference), "")

    def test_the_committed_godot_file_is_up_to_date(self) -> None:
        self.assertEqual(b.TARGET.read_text(encoding="utf-8"), b.dumps(b.build_godot(b.load_regional())))

    def test_the_threejs_lines_run_on_inside_their_old_box(self) -> None:
        # CHANGED (G-461): the Godot file now comes from the regional extract and runs the two
        # Three.js lines to Chennai Beach and Tambaram instead of stopping at the old box. Inside
        # that box they still retrace the Three.js lines (within 2.5 m: the return line is eased
        # onto its own track), call at the same stations in the same order and spacing (within 2 m),
        # keep their headways and offsets, and every Three.js track is still drawn (within 2 m).
        reference = json.loads(b.THREEJS_RAIL.read_text(encoding="utf-8"))
        box = b.threejs_bounds()
        for old in reference["lines"]:
            new = next(line for line in self.godot["lines"] if line["id"] == old["id"])
            path = b.RailPath.from_flat(new["points"])
            for p in b.RailPath.from_flat(old["points"]).points:
                if b.inside(p, box, 0):
                    self.assertLess(path.project(p)[2], 2.5, f"{old['id']} at {p}")
            names = [s["name"] for s in old["stops"]]
            kept = [s for s in new["stops"] if s["name"] in names]
            self.assertEqual([s["name"] for s in kept], names, old["id"])
            for i in range(len(names) - 1):
                self.assertAlmostEqual(kept[i + 1]["s"] - kept[i]["s"], old["stops"][i + 1]["s"] - old["stops"][i]["s"], delta=2.0)
            self.assertEqual((new["headwayMinutes"], new["offsetMinutes"]), (old["headwayMinutes"], old["offsetMinutes"]))
        tracks = [b.RailPath.from_flat(t["points"]).points for t in self.godot["tracks"]]
        grid = b._segment_grid(tracks, 50.0)
        for t in reference["tracks"]:
            for p in b.RailPath.from_flat(t["points"]).points:
                near = min((b._foot(p, a, c)[1] for a, c in grid.get((int(p[0] // 50), int(p[1] // 50)), [])), default=math.inf)
                self.assertLess(near, 2.0, f"track {t['id']} at {p}")

    def test_lines_run_past_the_old_map_edge(self) -> None:
        # G-461: the suburban lines run to their real ends in the world, or off its edge.
        lines = {line["id"]: line for line in self.godot["lines"]}
        stops = lambda i: [s["name"] for s in lines[i]["stops"]]
        self.assertEqual((stops("beach-tambaram")[0], stops("beach-tambaram")[-1]), ("Chennai Beach", "Tambaram"))
        # OSM's Tambaram - Chengalpattu relation maps its track from just south of Tambaram (which
        # is the Beach line's terminus): the line starts standing at Perungalattur, the first
        # station on that track, and calls at Vandalur next.
        self.assertEqual((stops("tambaram-chengalpattu")[0], stops("tambaram-chengalpattu")[-1]), ("Perungalattur", "Chengalpattu Junction"))
        self.assertEqual(stops("tambaram-chengalpattu")[1], "Vandalur")
        self.assertEqual(stops("chengalpattu-tambaram"), list(reversed(stops("tambaram-chengalpattu"))))
        for want in ("Avadi", "Pattabiram", "Sevvapet Road"):
            self.assertIn(want, stops("central-arakkonam"))
        for want in ("Ennore", "Ponneri", "Gummidipundi"):
            self.assertIn(want, stops("central-sullurpeta"))
        self.assertTrue(lines["central-arakkonam"]["to"]["beyond"] and lines["arakkonam-central"]["from"]["beyond"])
        self.assertTrue(lines["central-sullurpeta"]["to"]["beyond"] and lines["sullurpeta-central"]["from"]["beyond"])
        old = b.threejs_bounds()
        outside = sum(1 for line in self.godot["lines"] for s in line["stops"] if not b.inside(b.RailPath.from_flat(line["points"]).at(s["s"])[:2], old, 0))
        self.assertGreater(outside, 100, "stops beyond the old box")
        world = b.world_bounds()
        for line in self.godot["lines"]:
            for p in b.RailPath.from_flat(line["points"]).points:
                self.assertTrue(b.inside(p, world, 150.5), f"{line['id']} stays in the world (+ the margin)")
            # A line end in the world is a terminus: trains never appear at speed mid-world.
            path = b.RailPath.from_flat(line["points"])
            if not line["from"]["beyond"]:
                self.assertLessEqual(line["stops"][0]["s"], b.TERMINUS_REACH, f"{line['id']} starts at a station")
            if not line["to"]["beyond"]:
                self.assertLessEqual(path.length - line["stops"][-1]["s"], b.TERMINUS_REACH, f"{line['id']} ends at a station")

    def test_return_services_run_on_their_own_track(self) -> None:
        # G-461: no two lines run head-on on the same centre line for more than a crossover's length.
        paths = {line["id"]: b.RailPath.from_flat(line["points"]) for line in self.godot["lines"]}
        for a, c in (("tambaram-chengalpattu", "chengalpattu-tambaram"), ("central-arakkonam", "arakkonam-central"),
                     ("central-sullurpeta", "sullurpeta-central"), ("central-sullurpeta", "coromandel-in")):
            pa, pc = paths[a], paths[c]
            shared, s = 0.0, 0.0
            while s < pa.length:
                x, z, yaw, _ = pa.at(s)
                cs, _, d = pc.project((x, z))
                if d < 2.0 and math.cos(pc.at(cs)[2] - yaw) < -0.5:
                    shared += 50.0
                s += 50.0
            self.assertLess(shared / pa.length, 0.03, f"{a} / {c} head-on {shared:.0f} m")

    def test_metro_blue_and_green_both_ways(self) -> None:
        # G-462: Chennai Metro's Blue and Green lines from OSM `route=subway`, end to end.
        lines = {line["id"]: line for line in self.godot["lines"]}
        want = {"metro-blue-north": ("Chennai International Airport", "Wimco Nagar Depot", "blue"),
                "metro-blue-south": ("Wimco Nagar Depot", "Chennai International Airport", "blue"),
                "metro-green-north": ("St. Thomas Mount Metro", "Central Metro", "green"),
                "metro-green-south": ("Central Metro", "St. Thomas Mount Metro", "green")}
        for i, (first, last, colour) in want.items():
            line = lines[i]
            self.assertEqual((line["system"], line["train"], line["metroLine"]), ("metro", "metro", colour))
            self.assertEqual((line["stops"][0]["name"], line["stops"][-1]["name"]), (first, last), i)
            self.assertGreaterEqual(len(line["stops"]), 17, i)
            self.assertTrue(all(s["nameTa"] for s in line["stops"]), i)
            h = line["heights"]
            self.assertGreater(sum(1 for v in h if v >= b.METRO_VIADUCT_HEIGHT - 0.01), len(h) // 5, f"{i} on its viaducts")
            self.assertGreater(sum(1 for v in h if v <= b.METRO_TUNNEL_DEPTH + 0.01), len(h) // 5, f"{i} in its tunnels")
        north = [s["name"] for s in lines["metro-blue-north"]["stops"]]
        south = [s["name"] for s in lines["metro-blue-south"]["stops"]]
        self.assertEqual(north, list(reversed(south)))
        for name in ("Guindy Metro", "Thousand Lights", "Washermanpet", "Alandur"):
            self.assertIn(name, north)
        green = [s["name"] for s in lines["metro-green-north"]["stops"]]
        for name in ("Vadapalani", "Koyambedu", "Anna Nagar Tower", "Egmore", "Alandur"):
            self.assertIn(name, green)

    def test_every_line_is_a_real_route_relation_with_stops(self) -> None:
        ids = {spec.id for spec in b.GODOT_LINES}
        for line in self.godot["lines"]:
            self.assertIn(line["id"], ids)
            self.assertGreater(len(line["stops"]), 0, line["id"])
            for stop in line["stops"]:
                self.assertTrue(stop["nameTa"], f"{line['id']} {stop['name']} has a Tamil name")

    def test_no_two_lines_trains_meet_on_shared_track(self) -> None:
        self.assertEqual(b.conflicts(self.godot["lines"], 4.0), [])

    def test_the_mrts_and_the_metro_ramp_at_their_grades(self) -> None:
        for line in self.godot["lines"]:
            if line.get("system") not in b.GRADES:
                self.assertNotIn("heights", line)
                continue
            up, down, grade = b.GRADES[line["system"]]
            h = line["heights"]
            self.assertEqual(len(h), len(line["points"]) // 2)
            path = b.RailPath.from_flat(line["points"])
            for i in range(1, len(h)):
                run = path.lengths[i] - path.lengths[i - 1]
                self.assertLessEqual(abs(h[i] - h[i - 1]), run * grade + 0.11, f"{line['id']} grade at {i}")
            for stop in line["stops"]:
                i = max(0, min(len(h) - 1, path._segment(stop["s"])))
                level = (h[i], h[min(i + 1, len(h) - 1)])
                if line["system"] == "mrts":
                    # Every MRTS stop of the old box is on the viaduct, as before (the same 13).
                    # CHANGED (G-461): the regional extract adds stops OSM maps at grade (Chennai
                    # Beach and Fort, Velachery); each new stop must stand where its relation's
                    # track is mapped: on the viaduct where a way there is tagged elevated, else on
                    # the ground. The tags decide, not a list of names.
                    if stop["name"] in MRTS_OLD_BOX or self._mrts_mapped_elevated(line, path, stop["s"]):
                        self.assertGreaterEqual(min(level), b.VIADUCT_HEIGHT - 0.01, stop["name"])
                    else:
                        self.assertEqual(max(level), 0.0, stop["name"])
                else:
                    # A Metro platform is level: on the viaduct, in the tunnel or on the ground.
                    self.assertIn(level[0], (up, down, 0.0), stop["name"])
                    self.assertEqual(level[0], level[1], stop["name"])
            if line["system"] == "mrts":
                self.assertGreater(sum(1 for v in h if v >= b.VIADUCT_HEIGHT - 0.01) / len(h), 0.5)

    def _mrts_mapped_elevated(self, line: dict, path: b.RailPath, s: float) -> bool:
        """Is any of the relation's ways nearest the platform (its middle and ends) tagged elevated?"""
        spec = next(x for x in b.GODOT_LINES if x.id == line["id"])
        rel = next(e for e in self.regional["elements"] if e["type"] == "relation" and e["id"] == spec.relation)
        ways = {e["id"]: e for e in self.regional["elements"] if e["type"] == "way"}
        nodes = {e["id"]: b.to_local(e["lat"], e["lon"]) for e in self.regional["elements"] if e["type"] == "node"}
        members = [ways[m["ref"]] for m in rel["members"] if m["type"] == "way" and m["ref"] in ways and m["role"] in ("", "forward", "backward")]
        for ds in (-55.0, 0.0, 55.0):
            p = path.at(s + ds)[:2]
            nearest = min(members, key=lambda w: b.distance_to_polyline(p, [nodes[n] for n in w["nodes"] if n in nodes]) if len(w["nodes"]) > 1 else math.inf)
            if b._elevated(nearest.get("tags", {})):
                return True
        return False

    def test_level_crossings_lie_on_drawn_tracks(self) -> None:
        tracks = [b.RailPath.from_flat(t["points"]).points for t in self.godot["tracks"]]
        grid = b._segment_grid(tracks, 50.0)
        self.assertGreater(len(self.godot["crossings"]), 0)
        for c in self.godot["crossings"]:
            p = (c["x"], c["z"])
            self.assertLess(min((b._foot(p, a, d)[1] for a, d in grid.get((int(p[0] // 50), int(p[1] // 50)), [])), default=math.inf), 3.01)


if __name__ == "__main__":
    unittest.main(verbosity=1)
