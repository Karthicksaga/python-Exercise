"""Clip an OSM PBF to a bounding box in two passes and write Overpass-style JSON plus counts.
Pass 1 keeps the locations of nodes inside the box; pass 2 keeps ways made of them. Closed
ways (buildings, areas) cut by the box edge are dropped; open ways are split into the runs
inside the box."""
import collections, json, sys
import osmium

S, W, N, E = 12.98, 80.195, 13.095, 80.29
src, out = sys.argv[1], sys.argv[2]
WAY_KEYS = ("building", "highway", "leisure", "landuse", "natural", "waterway")
NODE_KEYS = ("amenity", "shop", "tourism", "historic", "place", "man_made")


class Nodes(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.loc = {}
        self.tagged = []
        self.count = collections.Counter()

    def node(self, n):
        lat, lon = n.location.lat, n.location.lon
        if not (S <= lat <= N and W <= lon <= E):
            return
        self.loc[n.id] = (round(lat, 7), round(lon, 7))
        if not n.tags:
            return
        tags = {t.k: t.v for t in n.tags}
        if tags.get("natural") == "tree":
            label = "tree"
        elif tags.get("highway") in ("bus_stop", "traffic_signals"):
            label = tags["highway"]
        else:
            label = next((k for k in NODE_KEYS if k in tags), None)
        if label:
            self.tagged.append({"type": "node", "id": n.id, "lat": round(lat, 7), "lon": round(lon, 7), "tags": tags})
            self.count["node:" + label] += 1


class Ways(osmium.SimpleHandler):
    def __init__(self, loc):
        super().__init__()
        self.loc = loc
        self.ways = []
        self.used = set()
        self.count = collections.Counter()

    def way(self, w):
        tags = {t.k: t.v for t in w.tags}
        if not (any(k in tags for k in WAY_KEYS) or tags.get("amenity") == "place_of_worship" or tags.get("man_made") == "tower"):
            return
        refs = [nd.ref for nd in w.nodes]
        if not refs:
            return
        closed = len(refs) > 3 and refs[0] == refs[-1]
        if closed:
            if not all(r in self.loc for r in refs):
                return
            runs = [refs]
        else:
            runs, run = [], []
            for r in refs:
                if r in self.loc:
                    run.append(r)
                else:
                    if len(run) > 1:
                        runs.append(run)
                    run = []
            if len(run) > 1:
                runs.append(run)
        for i, run in enumerate(runs):
            self.used.update(run)
            self.ways.append({"type": "way", "id": w.id if i == 0 else w.id * 100 + i, "nodes": run, "tags": tags})
        if runs:
            if "building" in tags:
                kind = "building"
            elif "highway" in tags:
                kind = "highway:" + tags["highway"]
            else:
                kind = next((k + ":" + tags[k] for k in WAY_KEYS if k in tags), "other")
            self.count["way:" + kind] += 1


nodes = Nodes()
nodes.apply_file(src)
print("nodes in box", len(nodes.loc), flush=True)
ways = Ways(nodes.loc)
ways.apply_file(src)
elements = nodes.tagged + ways.ways + [{"type": "node", "id": i, "lat": nodes.loc[i][0], "lon": nodes.loc[i][1]} for i in ways.used]
with open(out, "w") as f:
    json.dump({"version": 0.6, "generator": "Geofabrik southern-zone-261115, clipped", "osm3s": {"timestamp_osm_base": "2026-11-16T00:05:41Z"}, "elements": elements}, f, separators=(",", ":"))
print("ways", len(ways.ways), "tagged nodes", len(nodes.tagged), "geometry nodes", len(ways.used))
for k, v in sorted((nodes.count + ways.count).items(), key=lambda kv: -kv[1])[:50]:
    print(f"{v:8d} {k}")
