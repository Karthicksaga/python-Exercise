"""Cut the railway out of an OSM PBF into Overpass-style JSON (the same shape scripts/fetch-rail.mjs
saves), so the railway can come from the same extract as the city when Overpass is unreachable.

Keeps, inside the box: railway=rail and light_rail ways (whole, with all their nodes, so a line
running off the map keeps its outside part), railway stations, halts and level crossings,
platforms, and the train route relations that use those ways (tags and members).

    python -I scripts/clip-rail.py tamil_nadu.osm.pbf assets/osm/rail/chennai-rail.osm.json <timestamp>
"""
import json, sys
import osmium

S, W, N, E = 12.975, 80.19, 13.10, 80.295
src, out = sys.argv[1], sys.argv[2]
stamp = sys.argv[3] if len(sys.argv) > 3 else "unknown"


def inside(lat, lon):
    return S <= lat <= N and W <= lon <= E


class Pass1(osmium.SimpleHandler):
    """Rail ways and platforms, by their node ids; station nodes in the box."""

    def __init__(self):
        super().__init__()
        self.ways = {}
        self.points = []

    def node(self, n):
        if not n.tags or not n.location.valid():
            return
        tags = {t.k: t.v for t in n.tags}
        if tags.get("railway") in ("station", "halt", "level_crossing") and inside(n.location.lat, n.location.lon):
            self.points.append({"type": "node", "id": n.id, "lat": round(n.location.lat, 7), "lon": round(n.location.lon, 7), "tags": tags})

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        rail = tags.get("railway") in ("rail", "light_rail", "platform") or (tags.get("public_transport") == "platform" and tags.get("train") == "yes")
        if rail:
            self.ways[w.id] = {"type": "way", "id": w.id, "nodes": [n.ref for n in w.nodes], "tags": tags}


class Pass2(osmium.SimpleHandler):
    """Locations of the ways' nodes; route relations that use a kept way."""

    def __init__(self, ways):
        super().__init__()
        self.wanted = {ref for w in ways.values() for ref in w["nodes"]}
        self.ways = ways
        self.loc = {}
        self.relations = []

    def node(self, n):
        if n.id in self.wanted and n.location.valid():
            self.loc[n.id] = (round(n.location.lat, 7), round(n.location.lon, 7))

    def relation(self, r):
        tags = {t.k: t.v for t in r.tags}
        if tags.get("route") not in ("train", "railway", "light_rail"):
            return
        members = [{"type": {"n": "node", "w": "way", "r": "relation"}[m.type], "ref": m.ref, "role": m.role} for m in r.members]
        if any(m["type"] == "way" and m["ref"] in self.ways for m in members):
            self.relations.append({"type": "relation", "id": r.id, "members": members, "tags": tags})


p1 = Pass1()
p1.apply_file(src, locations=True)
p2 = Pass2(p1.ways)
p2.apply_file(src)
# Keep ways that touch the box (any node inside); their outside nodes stay, so lines run on past the edge.
ways = [w for w in p1.ways.values() if any(ref in p2.loc and inside(*p2.loc[ref]) for ref in w["nodes"])]
refs = {ref for w in ways for ref in w["nodes"]}
nodes = [{"type": "node", "id": ref, "lat": p2.loc[ref][0], "lon": p2.loc[ref][1]} for ref in sorted(refs) if ref in p2.loc]
point_ids = {p["id"] for p in p1.points}
nodes = [n for n in nodes if n["id"] not in point_ids] + p1.points
# Relations keep only the members in this file (a state-wide route is cut to the map's part).
kept = {("way", w["id"]) for w in ways} | {("node", n["id"]) for n in nodes}
relations = []
for r in p2.relations:
    members = [m for m in r["members"] if (m["type"], m["ref"]) in kept]
    if sum(1 for m in members if m["type"] == "way") >= 2:
        relations.append({**r, "members": members})
data = {"version": 0.6, "generator": "scripts/clip-rail.py", "osm3s": {"timestamp_osm_base": stamp}, "elements": nodes + ways + relations}
with open(out, "w") as f:
    json.dump(data, f, separators=(",", ":"))
print(f"{len(nodes)} nodes, {len(ways)} ways, {len(relations)} relations -> {out}")
