class_name TrafficDensity
extends RefCounted
## How busy the streets are by time of day and by road class (port of `ai/src/Density.ts`). The
## place-by-place crowd levels of TD-31 are `PlaceMap`; this is the time-of-day curve of the
## pools and the spawn weight of each edge (main avenues and streets with shops get more).

## Share of the traffic pool out at each hour: two rush hours, quiet after midnight.
const TRAFFIC_BY_HOUR: Array[Vector2] = [
	Vector2(0, 0.25), Vector2(5, 0.25), Vector2(7, 0.6), Vector2(8, 1), Vector2(10, 1), Vector2(11.5, 0.75),
	Vector2(16, 0.75), Vector2(17, 1), Vector2(20, 1), Vector2(22, 0.5), Vector2(24, 0.25),
]
## People out walking: early start, a lull after lunch, busy evenings.
const PEOPLE_BY_HOUR: Array[Vector2] = [
	Vector2(0, 0.15), Vector2(5, 0.15), Vector2(6.5, 0.6), Vector2(9, 1), Vector2(13, 0.8), Vector2(15, 0.7),
	Vector2(17, 1), Vector2(21, 0.8), Vector2(23, 0.3), Vector2(24, 0.15),
]
## How much more traffic a road class carries than a residential street.
const CLASS_WEIGHT := {&"motorway": 3.5, &"primary": 3.2, &"secondary": 2.6, &"tertiary": 1.8, &"residential": 1.0, &"service": 0.5, &"footway": 0.5}
## Shops and services within this distance of a road make it busier, metres.
const SHOP_RADIUS := 120.0


static func sample(curve: Array[Vector2], hour: float) -> float:
	var h := fposmod(hour, 24.0)
	for i in range(1, curve.size()):
		if h <= curve[i].x:
			var a := curve[i - 1]
			var b := curve[i]
			return a.y + (b.y - a.y) * (h - a.x) / (b.x - a.x)
	return curve[curve.size() - 1].y


## 0..1: how much of the traffic pool is on the roads at this hour.
static func traffic(hour: float) -> float:
	return sample(TRAFFIC_BY_HOUR, hour)


## 0..1: how many of the walkers are out at this hour.
static func pedestrians(hour: float) -> float:
	return sample(PEOPLE_BY_HOUR, hour)


## A spawn weight per edge: road class times (1 + 0.15 per shop near, at most 6).
static func edge_busyness(g: RoadGraph, pois: PackedVector2Array) -> PackedFloat32Array:
	var cells: Dictionary[Vector2i, PackedVector2Array] = {}
	for p in pois:
		var k := Vector2i(floori(p.x / SHOP_RADIUS), floori(p.y / SHOP_RADIUS))
		if not cells.has(k):
			cells[k] = PackedVector2Array()
		cells[k].append(p)
	var w := PackedFloat32Array()
	w.resize(g.edge_count())
	for e in g.edge_count():
		var m := g.middle(e)
		var c := Vector2i(floori(m.x / SHOP_RADIUS), floori(m.y / SHOP_RADIUS))
		var shops := 0
		for i in range(-1, 2):
			for k in range(-1, 2):
				for p: Vector2 in cells.get(c + Vector2i(i, k), PackedVector2Array()):
					if p.distance_to(m) < SHOP_RADIUS:
						shops += 1
		w[e] = float(CLASS_WEIGHT.get(g.kind(e), 1.0)) * (1.0 + mini(shops, 6) * 0.15)
	return w
