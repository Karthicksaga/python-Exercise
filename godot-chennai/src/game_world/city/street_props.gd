class_name StreetProps
extends RefCounted
## Pavement props (vegetable handcarts, crates, barrels, clay pots) along the main roads
## (`props.ts`). **Invented**: OSM maps none of it. Placed from the road's id and the distance
## along it, so a chunk looks the same every time it loads; clear of junctions, other
## carriageways, buildings, poles and shelters, and of the pedestrians' walking line.

## Footprint half-sizes (x along the road, z across) and height, metres, measured on the
## Blender models (`PROP_SIZE`).
const SIZE: Dictionary[StringName, Vector3] = {
	&"handcart": Vector3(0.8, 0.58, 1.93),
	&"crates": Vector3(0.47, 0.24, 0.66),
	&"barrel": Vector3(0.32, 0.32, 0.8),
	&"clay_pots": Vector3(0.43, 0.43, 0.46),
}
const PITCH := 13.0
const CHANCE := 0.14
## Distance of a prop's front edge outside the carriageway, metres (the back of the pavement).
const FRONT := 2.25
const POLE_CLEAR := 2.0
const SHELTER_CLEAR := 4.5

## Groups as seen in front of shops: weight, then [kind, along, out] items.
const GROUPS: Array = [
	[0.12, [[&"handcart", 0.0, 0.0]]],
	[0.08, [[&"handcart", 0.0, 0.0], [&"crates", 1.45, 0.0]]],
	[0.35, [[&"crates", 0.0, 0.0], [&"crates", 1.05, 0.0], [&"barrel", 1.95, 0.0]]],
	[0.2, [[&"clay_pots", 0.0, 0.0], [&"clay_pots", 1.05, 0.1]]],
	[0.25, [[&"barrel", 0.0, 0.0], [&"barrel", 0.72, 0.0]]],
]


class Prop:
	extends RefCounted
	var kind: StringName
	var position: Vector2
	var yaw: float
	var road_id: int


static func _pick_group(r: float) -> Array:
	var acc := 0.0
	for g: Array in GROUPS:
		acc += float(g[0])
		if r < acc:
			return g[1]
	return GROUPS[GROUPS.size() - 1][1]


static func corners(p: Prop) -> PackedVector2Array:
	var s: Vector3 = SIZE[p.kind]
	var c := cos(p.yaw)
	var n := sin(p.yaw)
	var out := PackedVector2Array()
	for l: Vector2 in [Vector2(-s.x, -s.y), Vector2(s.x, -s.y), Vector2(-s.x, s.y), Vector2(s.x, s.y)]:
		out.append(Vector2(p.position.x + l.x * c + l.y * n, p.position.y - l.x * n + l.y * c))
	return out


## Candidate props along one road between distances `from` and `to` (`propsAlong`).
static func along_road(road: Road, dist: PackedFloat64Array, from: float, to: float, stretches: PackedVector2Array) -> Array[Prop]:
	var out: Array[Prop] = []
	var phase := CityHash.prop_unit(road.id, 1) * PITCH
	var offset := road.width / 2.0 + FRONT
	var total := dist[dist.size() - 1] if dist.size() > 0 else 0.0
	var k := maxi(0, ceili((from - phase) / PITCH))
	while phase + k * PITCH < to:
		var d0 := phase + k * PITCH
		if d0 >= from:
			for side: float in [1.0, -1.0]:
				var salt := k * 2 + (0 if side > 0.0 else 1)
				if CityHash.prop_unit(road.id, 100 + salt) >= CHANCE:
					continue
				var items := _pick_group(CityHash.prop_unit(road.id, 10000 + salt))
				var ok := true
				for item: Array in items:
					var d := d0 + float(item[1]) * side
					if d < dist[0] or d > total:
						ok = false
					for st in stretches:
						if d >= st.x - 1.5 and d <= st.y + 1.5:
							ok = false
				if not ok:
					continue
				var turn := (CityHash.prop_unit(road.id, 20000 + salt) - 0.5) * 0.3
				for item: Array in items:
					var at := CityLayout.point_along(road.points, dist, d0 + float(item[1]) * side)
					var dir: Vector2 = at["dir"]
					var l := Vector2(dir.y * side, -dir.x * side)
					var kind: StringName = item[0]
					var out_ := offset + float(item[2]) + (SIZE[kind] as Vector3).y
					var prop := Prop.new()
					prop.kind = kind
					prop.position = (at["p"] as Vector2) + l * out_
					prop.yaw = atan2(l.x, l.y) + turn
					prop.road_id = road.id
					out.append(prop)
		k += 1
	return out


## The pavement props of one chunk (`chunkProps`).
static func for_chunk(layout: CityLayout, chunk: ChunkData, cell: Vector2i, furniture: StreetFurniture.Result) -> Array[Prop]:
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	var out: Array[Prop] = []
	for span: CityLayout.RoadSpan in layout.spans_in(cell):
		if not span.road.is_main():
			continue
		var dist: PackedFloat64Array = layout.along[span.index]
		var stretches := layout.blocked_stretches(span.index, true)
		for prop in along_road(span.road, dist, dist[span.start], dist[span.end], stretches):
			if StreetFurniture.in_building(chunk.buildings, boxes, prop.position, 0.3):
				continue
			var hit := false
			for c in corners(prop):
				hit = hit or StreetFurniture.in_building(chunk.buildings, boxes, c, 0.2)
			if hit or layout.on_other_road(prop.position, prop.road_id, 1.5):
				continue
			for p in furniture.poles:
				hit = hit or p.position.distance_to(prop.position) < POLE_CLEAR
			for s in furniture.shelters:
				hit = hit or s.position.distance_to(prop.position) < SHELTER_CLEAR
			if not hit:
				out.append(prop)
	return out
