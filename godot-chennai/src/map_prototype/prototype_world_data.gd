class_name PrototypeWorldData
extends RefCounted
## Read-only geographical data provider for the Chennai Map UI/UX Prototype.
## Reads directly from `res://world/` (RegionalWorldSource format 2), `res://world/rail/rail.json`,
## and `res://data/areas/areas.json` without modifying or generating any game files.

const AREAS_JSON := "res://data/areas/areas.json"
const RAIL_JSON := "res://world/rail/rail.json"
const AREAS_MAGIC := 0x41574f43  # "COWA"
const EARTH_RADIUS := 6371008.8
const DEG := PI / 180.0
const TILE_LOAD_CAP_PER_VIEW := 9
const MAX_SEARCH_CACHE_TILES := 16

var source: RegionalWorldSource = null
var loaded: bool = false
var error: String = ""

## Real Chennai areas from `data/areas/areas.json` ({id, name, name_ta, pos, radius, type}).
var areas_meta: Array[Dictionary] = []
## Real railway/MRTS data from `world/rail/rail.json`.
var rail_tracks: Array[PackedVector2Array] = []
var rail_track_systems: Array[String] = []
var rail_stations: Array[Dictionary] = []

## Aggregated real index entries across all 47 tiles in `res://world/tiles/*/tile.json`.
var all_districts: Array[Dictionary] = []
var all_pois: Array[Dictionary] = []
var all_bus_stops: Array[Dictionary] = []
var all_road_names: Array[Dictionary] = []  # [{name, tiles: Array[Vector2i]}]
var _road_name_map: Dictionary[String, int] = {}

## Clearly identified SAMPLE mission markers (prototype-only; real game saves untouched).
var sample_missions: Array[Dictionary] = [
	{"id": "sample-m1", "kind": &"pickup", "label": "[SAMPLE] Auto Pickup · Anna Nagar Tower", "x": 402.4, "z": -147.9, "locality": "Anna Nagar"},
	{"id": "sample-m2", "kind": &"mission", "label": "[SAMPLE] Courier · Egmore Station", "x": 5279.0, "z": 782.0, "locality": "Egmore"},
	{"id": "sample-m3", "kind": &"dropoff", "label": "[SAMPLE] Dropoff · Marina Beach", "x": 7991.7, "z": 3422.5, "locality": "Marina / Triplicane"},
]

## Cached decoded `areas.bin` per tile: Vector2i -> Array[Dictionary] ({kind, outline: PackedVector2Array, box: Rect2})
var _tile_areas: Dictionary[Vector2i, Array] = {}
## Cached chunk building outlines for detailed zoom: Vector2i(cell) -> Array[PackedVector2Array]
var _chunk_buildings: Dictionary[Vector2i, Array] = {}
## Spatial district lookup grid (1000 m cells).
var _district_cells: Dictionary[Vector2i, Array] = {}
## Road-name centroid cache once a tile's roads.bin is read: "tile_key|name" -> Vector2
var _road_centroids: Dictionary[String, Vector2] = {}
var _cos_lat: float = 1.0


func open_readonly() -> String:
	if loaded:
		return error
	if not RegionalWorldSource.available():
		error = "res://world/world.json not found."
		return error
	source = RegionalWorldSource.new()
	error = source.open_index()
	if error != "":
		return error
	_cos_lat = cos(source.latitude * DEG)
	_load_areas_meta()
	_load_rail()
	_index_all_tiles()
	# Preload the central tile (where Anna Nagar spawn sits) so initial render is instant.
	ensure_tile(source.tile_at(Vector2(40.0, 60.0)), true)
	loaded = true
	return ""


func _load_areas_meta() -> void:
	areas_meta.clear()
	if not FileAccess.file_exists(AREAS_JSON):
		return
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(AREAS_JSON)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return
	var root_dict: Dictionary = json.data
	var list_var: Variant = root_dict.get("areas", [])
	if not (list_var is Array):
		return
	for item_var: Variant in (list_var as Array):
		if not (item_var is Dictionary):
			continue
		var item: Dictionary = item_var as Dictionary
		var names: Dictionary = item.get("names", {})
		var en := str(names.get("en", ""))
		if en == "":
			continue
		var ta_dict: Dictionary = names.get("ta", {})
		var ta := str(ta_dict.get("value", ""))
		var centre: Dictionary = item.get("centre", {})
		var boundary: Dictionary = item.get("boundary", {})
		var pos := Vector2(float(centre.get("x", 0.0)), float(centre.get("z", 0.0)))
		var radius := float(boundary.get("radius_m", 900.0))
		var char_dict: Dictionary = item.get("character", {})
		areas_meta.append({
			"id": str(item.get("id", "")),
			"name": en,
			"name_ta": ta,
			"pos": pos,
			"radius": radius,
			"kind": str(char_dict.get("type", "locality")),
		})


func _load_rail() -> void:
	rail_tracks.clear()
	rail_track_systems.clear()
	rail_stations.clear()
	if not FileAccess.file_exists(RAIL_JSON):
		return
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(RAIL_JSON)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return
	var d: Dictionary = json.data
	var tracks_var: Variant = d.get("tracks", [])
	if tracks_var is Array:
		for tr_var: Variant in (tracks_var as Array):
			if not (tr_var is Dictionary):
				continue
			var tr: Dictionary = tr_var as Dictionary
			var pts_var: Variant = tr.get("points", [])
			if not (pts_var is Array):
				continue
			var line := PackedVector2Array()
			for p_var: Variant in (pts_var as Array):
				if p_var is Dictionary:
					var pd: Dictionary = p_var as Dictionary
					line.append(Vector2(float(pd.get("x", 0.0)), float(pd.get("z", 0.0))))
				elif p_var is Array and (p_var as Array).size() >= 2:
					var pa: Array = p_var as Array
					line.append(Vector2(float(pa[0]), float(pa[1])))
			if line.size() >= 2:
				rail_tracks.append(line)
				rail_track_systems.append(str(tr.get("system", "suburban")))
	var st_var: Variant = d.get("stations", [])
	if st_var is Array:
		for s_var: Variant in (st_var as Array):
			if not (s_var is Dictionary):
				continue
			var sd: Dictionary = s_var as Dictionary
			rail_stations.append({
				"id": str(sd.get("id", "")),
				"name": str(sd.get("name", "")),
				"name_ta": str(sd.get("nameTa", "")),
				"pos": Vector2(float(sd.get("x", 0.0)), float(sd.get("z", 0.0))),
				"category": "Railway Station",
				"kind": &"station",
			})


func _index_all_tiles() -> void:
	all_districts.clear()
	all_pois.clear()
	all_bus_stops.clear()
	all_road_names.clear()
	_road_name_map.clear()
	_district_cells.clear()
	if source == null:
		return
	for tile_key: Vector2i in source.tiles:
		var idx: WorldIndex = source.tiles[tile_key]
		for d: Place in idx.districts:
			var rec := {
				"name": d.name,
				"kind": String(d.kind),
				"pos": d.position,
				"tile": tile_key,
				"name_ta": _tamil_for_area(d.name),
			}
			all_districts.append(rec)
			var cell := Vector2i(floori(d.position.x / 1000.0), floori(d.position.y / 1000.0))
			if not _district_cells.has(cell):
				_district_cells[cell] = []
			(_district_cells[cell] as Array).append(rec)
		for p: Place in idx.pois:
			if p.name == "":
				continue
			all_pois.append({
				"name": p.name,
				"kind": String(p.kind),
				"pos": p.position,
				"tile": tile_key,
			})
		for bs: Place in idx.bus_stops:
			if bs.name == "":
				continue
			all_bus_stops.append({
				"name": bs.name,
				"kind": "bus_stop",
				"pos": bs.position,
				"tile": tile_key,
			})
		for rn: String in idx.road_names:
			if rn == "":
				continue
			if _road_name_map.has(rn):
				var entry_idx: int = _road_name_map[rn]
				var entry: Dictionary = all_road_names[entry_idx]
				var tlist: Array = entry["tiles"]
				if not tlist.has(tile_key):
					tlist.append(tile_key)
			else:
				_road_name_map[rn] = all_road_names.size()
				all_road_names.append({"name": rn, "tiles": [tile_key]})


func _tamil_for_area(en_name: String) -> String:
	var low := en_name.to_lower()
	for a: Dictionary in areas_meta:
		if str(a["name"]).to_lower() == low:
			return str(a["name_ta"])
	return ""


## Ensures road & area data for `tile` is decoded (read-only).
func ensure_tile(tile: Vector2i, with_areas: bool = true) -> void:
	if source == null or not source.tiles.has(tile):
		return
	var net: RoadNetwork = source.tile_roads(tile)
	if net != null:
		_index_road_centroids(tile, net)
	if with_areas and not _tile_areas.has(tile):
		_tile_areas[tile] = _decode_tile_areas(tile)


## Loads visible tiles up to a per-call budget so panning stays responsive.
func ensure_tiles_for_rect(world_rect: Rect2, with_areas: bool = true) -> int:
	if source == null:
		return 0
	var lo := source.tile_at(world_rect.position)
	var hi := source.tile_at(world_rect.end)
	var loaded_now := 0
	for tx in range(lo.x, hi.x + 1):
		for tz in range(lo.y, hi.y + 1):
			var tile := Vector2i(tx, tz)
			if not source.tiles.has(tile):
				continue
			var needs_roads := not _has_tile_roads_cached(tile)
			var needs_areas := with_areas and not _tile_areas.has(tile)
			if needs_roads or needs_areas:
				ensure_tile(tile, with_areas)
				loaded_now += 1
				if loaded_now >= TILE_LOAD_CAP_PER_VIEW:
					return loaded_now
	return loaded_now


func _has_tile_roads_cached(tile: Vector2i) -> bool:
	var prefix := "%d,%d|" % [tile.x, tile.y]
	for k: String in _road_centroids:
		if k.begins_with(prefix):
			return true
	return false


func _index_road_centroids(tile: Vector2i, net: RoadNetwork) -> void:
	var prefix := "%d,%d|" % [tile.x, tile.y]
	var marker_key := prefix + "__indexed__"
	if _road_centroids.has(marker_key):
		return
	_road_centroids[marker_key] = Vector2.ZERO
	for road: Road in net.roads:
		if road.name == "" or road.points.is_empty():
			continue
		var key := prefix + road.name
		if not _road_centroids.has(key):
			var mid := road.points[road.points.size() / 2]
			_road_centroids[key] = mid


func get_tile_areas(tile: Vector2i) -> Array:
	return _tile_areas.get(tile, [])


func get_roads_in_rect(world_rect: Rect2) -> Array[Road]:
	var out: Array[Road] = []
	if source == null:
		return out
	var lo := source.tile_at(world_rect.position)
	var hi := source.tile_at(world_rect.end)
	for tx in range(lo.x, hi.x + 1):
		for tz in range(lo.y, hi.y + 1):
			var tile := Vector2i(tx, tz)
			if not source.tiles.has(tile):
				continue
			var net := source.tile_roads(tile)
			if net == null:
				continue
			for road: Road in net.roads:
				out.append(road)
	return out


## Returns building outlines in `world_rect` from `chunks.bin` (capped for mobile/prototype smoothness).
func get_buildings_in_rect(world_rect: Rect2, max_chunks: int = 16) -> Array[PackedVector2Array]:
	var out: Array[PackedVector2Array] = []
	if source == null:
		return out
	var c0 := source.cell_at(world_rect.position)
	var c1 := source.cell_at(world_rect.end)
	var count := 0
	for cx in range(c0.x, c1.x + 1):
		for cz in range(c0.y, c1.y + 1):
			var cell := Vector2i(cx, cz)
			if not source.cells.has(cell):
				continue
			count += 1
			if count > max_chunks:
				return out
			if not _chunk_buildings.has(cell):
				var chunk := source.read_chunk(cell)
				var polys: Array[PackedVector2Array] = []
				if chunk != null and chunk.ok():
					for b: Building in chunk.buildings:
						if b.outline.size() >= 3:
							polys.append(b.outline)
				_chunk_buildings[cell] = polys
			for poly: PackedVector2Array in _chunk_buildings[cell]:
				out.append(poly)
	return out


func _decode_tile_areas(tile: Vector2i) -> Array:
	var out: Array = []
	if source == null:
		return out
	var path := source.dir.path_join("tiles/%d_%d/areas.bin" % [tile.x, tile.y])
	if not FileAccess.file_exists(path):
		return out
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		return out
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != AREAS_MAGIC or r.u16() != WorldCodecV2.FORMAT:
		return out
	r.i16()
	r.i16()
	var count := r.u32()
	for i in count:
		if r.overrun:
			break
		r.u32()  # area id
		r.u8()   # dataset
		WorldCodecV2._u64(r)
		var kind_idx := r.u8()
		var kind := WorldCodecV2.AREA_KINDS[kind_idx] if kind_idx < WorldCodecV2.AREA_KINDS.size() else &"park"
		var rings := r.u8()
		var outline := PackedVector2Array()
		for k in rings:
			var n := r.u32()
			if n == 0 or r.overrun:
				continue
			var x := r.i32()
			var z := r.i32()
			var pts := PackedVector2Array()
			pts.resize(n)
			pts[0] = Vector2(x / WorldCodecV2.Q, z / WorldCodecV2.Q)
			for p_idx in range(1, n):
				x += r.i16()
				z += r.i16()
				pts[p_idx] = Vector2(x / WorldCodecV2.Q, z / WorldCodecV2.Q)
			if k == 0:
				outline = pts
		if outline.size() >= 3:
			var lo := outline[0]
			var hi := outline[0]
			for p: Vector2 in outline:
				lo = lo.min(p)
				hi = hi.max(p)
			out.append({
				"kind": kind,
				"outline": outline,
				"box": Rect2(lo, hi - lo),
			})
	return out


## Real offline search across localities, landmarks, stations, POIs, road names, and sample missions.
func search(query: String, player_pos: Vector2, limit: int = 24) -> Array[Dictionary]:
	var q := query.strip_edges().to_lower()
	var results: Array[Dictionary] = []
	if q == "":
		# When empty, return curated quick picks across Chennai so the user can explore immediately.
		for lm: Landmark in source.get_landmarks():
			results.append({
				"name": lm.name,
				"name_ta": _tamil_for_area(lm.name),
				"category": "Landmark · " + String(lm.kind).capitalize(),
				"locality": identify_locality_name(lm.position),
				"pos": lm.position,
				"has_pos": true,
				"distance": lm.position.distance_to(player_pos),
				"source_tag": "OSM",
				"score": 10,
			})
		for a: Dictionary in areas_meta.slice(0, 8):
			var ap: Vector2 = a["pos"]
			results.append({
				"name": str(a["name"]),
				"name_ta": str(a["name_ta"]),
				"category": "Locality",
				"locality": "Chennai",
				"pos": ap,
				"has_pos": true,
				"distance": ap.distance_to(player_pos),
				"source_tag": "OSM/Area",
				"score": 9,
			})
		for st: Dictionary in rail_stations.slice(0, 6):
			var sp: Vector2 = st["pos"]
			results.append({
				"name": str(st["name"]) + " Railway Station",
				"name_ta": str(st["name_ta"]),
				"category": "Railway Station",
				"locality": identify_locality_name(sp),
				"pos": sp,
				"has_pos": true,
				"distance": sp.distance_to(player_pos),
				"source_tag": "OSM Rail",
				"score": 8,
			})
		return results.slice(0, limit)

	# 0. Direct GPS coordinate query (e.g. "13.0850, 80.2101" or "13.0827 80.2707")
	var gps := parse_latlng_query(query)
	if not gps.is_empty():
		var gp: Vector2 = gps["pos"]
		results.append({
			"name": "%.5f°N, %.5f°E" % [float(gps["lat"]), float(gps["lng"])],
			"name_ta": "",
			"category": "GPS Coordinate",
			"locality": identify_locality_name(gp),
			"pos": gp,
			"has_pos": true,
			"distance": gp.distance_to(player_pos),
			"source_tag": "GPS",
			"score": 200,
		})

	# 1. Landmarks
	if source != null:
		for lm: Landmark in source.get_landmarks():
			var sc := _match_score(q, lm.name, _tamil_for_area(lm.name), String(lm.kind))
			if sc > 0:
				results.append({
					"name": lm.name,
					"name_ta": _tamil_for_area(lm.name),
					"category": "Landmark · " + String(lm.kind).capitalize(),
					"locality": identify_locality_name(lm.position),
					"pos": lm.position,
					"has_pos": true,
					"distance": lm.position.distance_to(player_pos),
					"source_tag": "OSM",
					"score": sc + 40,
				})

	# 2. Curated Areas (with Tamil names)
	for a: Dictionary in areas_meta:
		var nm := str(a["name"])
		var ta := str(a["name_ta"])
		var sc := _match_score(q, nm, ta, "locality area")
		if sc > 0:
			var ap: Vector2 = a["pos"]
			results.append({
				"name": nm,
				"name_ta": ta,
				"category": "Locality",
				"locality": "Greater Chennai",
				"pos": ap,
				"has_pos": true,
				"distance": ap.distance_to(player_pos),
				"source_tag": "OSM/Area",
				"score": sc + 35,
			})

	# 3. Railway / MRTS Stations
	for st: Dictionary in rail_stations:
		var nm := str(st["name"])
		var ta := str(st["name_ta"])
		var sc := _match_score(q, nm + " station railway", ta, "railway station")
		if sc > 0:
			var sp: Vector2 = st["pos"]
			results.append({
				"name": nm + " Station",
				"name_ta": ta,
				"category": "Railway Station",
				"locality": identify_locality_name(sp),
				"pos": sp,
				"has_pos": true,
				"distance": sp.distance_to(player_pos),
				"source_tag": "OSM Rail",
				"score": sc + 30,
			})

	# 4. All 927 OSM Districts / Suburbs / Neighbourhoods
	for d: Dictionary in all_districts:
		var nm := str(d["name"])
		var ta := str(d["name_ta"])
		var kind := str(d["kind"])
		var sc := _match_score(q, nm, ta, kind)
		if sc > 0:
			var dp: Vector2 = d["pos"]
			results.append({
				"name": nm,
				"name_ta": ta,
				"category": kind.capitalize(),
				"locality": "Chennai Region",
				"pos": dp,
				"has_pos": true,
				"distance": dp.distance_to(player_pos),
				"source_tag": "OSM Place",
				"score": sc + 24,
			})

	# 5. Street names across all 47 tiles
	for rn_entry: Dictionary in all_road_names:
		var rname := str(rn_entry["name"])
		var sc := _match_score(q, rname, "", "road street avenue salai")
		if sc > 0:
			var tiles_arr: Array = rn_entry["tiles"]
			var first_tile: Vector2i = tiles_arr[0]
			var loc := _road_centroid_fast(first_tile, rname)
			var approx_pos: Vector2 = loc["pos"]
			results.append({
				"name": rname,
				"name_ta": "",
				"category": "Street / Road",
				"locality": identify_locality_name(approx_pos),
				"pos": approx_pos,
				"has_pos": bool(loc["exact"]),
				"tile": first_tile,
				"road_name": rname,
				"distance": approx_pos.distance_to(player_pos),
				"source_tag": "OSM Road",
				"score": sc + 20,
			})

	# 6. All 10,159 POIs (hospitals, temples, schools, malls, fuel, etc.)
	for p: Dictionary in all_pois:
		var nm := str(p["name"])
		var kind := str(p["kind"]).replace("_", " ")
		var sc := _match_score(q, nm, "", kind)
		if sc > 0:
			var pp: Vector2 = p["pos"]
			results.append({
				"name": nm,
				"name_ta": "",
				"category": kind.capitalize(),
				"locality": identify_locality_name(pp),
				"pos": pp,
				"has_pos": true,
				"distance": pp.distance_to(player_pos),
				"source_tag": "OSM POI",
				"score": sc + 16,
			})

	# 7. Sample Missions
	for sm: Dictionary in sample_missions:
		var nm := str(sm["label"])
		if nm.to_lower().contains(q) or q.contains("sample") or q.contains("mission"):
			var mp := Vector2(float(sm["x"]), float(sm["z"]))
			results.append({
				"name": nm,
				"name_ta": "",
				"category": "Mission (Sample)",
				"locality": str(sm["locality"]),
				"pos": mp,
				"has_pos": true,
				"distance": mp.distance_to(player_pos),
				"source_tag": "SAMPLE",
				"score": 15,
			})

	results.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var sa := int(a["score"])
		var sb := int(b["score"])
		if sa != sb:
			return sa > sb
		return float(a["distance"]) < float(b["distance"])
	)
	if results.size() > limit:
		results = results.slice(0, limit)
	return results


func _match_score(q: String, name: String, name_ta: String, kind: String) -> int:
	var nl := name.to_lower()
	if nl == q:
		return 100
	if nl.begins_with(q):
		return 70
	if nl.contains(q):
		return 45
	if name_ta != "" and name_ta.contains(q):
		return 80
	if kind != "" and kind.to_lower().contains(q):
		return 20
	return 0


func _road_centroid_fast(tile: Vector2i, road_name: String) -> Dictionary:
	var key := "%d,%d|%s" % [tile.x, tile.y, road_name]
	if _road_centroids.has(key):
		return {"pos": _road_centroids[key], "exact": true}
	var rect := source.tile_rect(tile)
	return {"pos": rect.get_center(), "exact": false}


## Resolves an exact road point on demand when the user picks a street search result.
func resolve_road_position(road_name: String, tile: Vector2i) -> Vector2:
	ensure_tile(tile, false)
	var key := "%d,%d|%s" % [tile.x, tile.y, road_name]
	if _road_centroids.has(key):
		return _road_centroids[key]
	return source.tile_rect(tile).get_center()


## Identifies the street at `pos` using loaded roads of the local tile, avoiding parallel-road flicker.
func identify_street(pos: Vector2, prev_street: String = "") -> Dictionary:
	if source == null:
		return {"name": "", "kind": &"", "bridge": false, "tunnel": false, "ref": ""}
	var tile := source.tile_at(pos)
	ensure_tile(tile, false)
	var net := source.tile_roads(tile)
	if net == null:
		return {"name": "", "kind": &"", "bridge": false, "tunnel": false, "ref": ""}
	var best_named: Road = null
	var best_named_d2 := 34.0 * 34.0
	var best_any: Road = null
	var best_any_d2 := 26.0 * 26.0
	var prev_d2 := INF
	var prev_road: Road = null
	for road: Road in net.roads:
		if road.kind == &"footway" or road.points.size() < 2:
			continue
		var d2 := _road_dist_sq(pos, road.points)
		if d2 > 40.0 * 40.0:
			continue
		if prev_street != "" and road.name == prev_street and d2 < prev_d2:
			prev_d2 = d2
			prev_road = road
		if road.name != "":
			var score_d2 := d2
			# Prefer major roads slightly when parallel service lane sits beside arterial.
			if Road.MAIN_KINDS.has(road.kind):
				score_d2 *= 0.85
			if score_d2 < best_named_d2:
				best_named_d2 = score_d2
				best_named = road
		elif d2 < best_any_d2:
			best_any_d2 = d2
			best_any = road
	# Hysteresis: keep current road unless a different named road is clearly closer (> 6 m margin).
	if prev_road != null and prev_d2 <= 28.0 * 28.0:
		if best_named == null or best_named.name == prev_street or best_named_d2 + 36.0 >= prev_d2:
			return _road_info(prev_road)
	if best_named != null:
		return _road_info(best_named)
	if best_any != null:
		return _road_info(best_any)
	return {"name": "", "kind": &"", "bridge": false, "tunnel": false, "ref": ""}


func _road_info(road: Road) -> Dictionary:
	return {
		"name": road.name,
		"kind": road.kind,
		"bridge": road.bridge,
		"tunnel": road.tunnel,
		"ref": road.ref,
	}


static func _road_dist_sq(pos: Vector2, pts: PackedVector2Array) -> float:
	var best := INF
	for i in range(pts.size() - 1):
		var c := Geometry2D.get_closest_point_to_segment(pos, pts[i], pts[i + 1])
		var d2 := pos.distance_squared_to(c)
		if d2 < best:
			best = d2
	return best


func identify_locality(pos: Vector2) -> Dictionary:
	# 1. Check curated Chennai areas first (they carry Tamil names and authentic neighbourhood bounds).
	var best_area: Dictionary = {}
	var best_ratio := 1.0
	for a: Dictionary in areas_meta:
		var center: Vector2 = a["pos"]
		var r: float = float(a["radius"])
		var ratio := pos.distance_to(center) / maxf(r, 1.0)
		if ratio < best_ratio:
			best_ratio = ratio
			best_area = a
	if not best_area.is_empty():
		return {"name": str(best_area["name"]), "name_ta": str(best_area["name_ta"]), "kind": "locality"}

	# 2. Fall back to spatial grid of all 927 OSM place nodes.
	var cx := floori(pos.x / 1000.0)
	var cz := floori(pos.y / 1000.0)
	var best_dist2 := 2400.0 * 2400.0
	var best_d: Dictionary = {}
	for dx in range(-2, 3):
		for dz in range(-2, 3):
			var cell := Vector2i(cx + dx, cz + dz)
			for d: Dictionary in _district_cells.get(cell, []):
				var dp: Vector2 = d["pos"]
				var d2 := dp.distance_squared_to(pos)
				if d2 < best_dist2:
					best_dist2 = d2
					best_d = d
	if not best_d.is_empty():
		return {"name": str(best_d["name"]), "name_ta": str(best_d["name_ta"]), "kind": str(best_d["kind"])}
	return {"name": "Chennai Region", "name_ta": "", "kind": "city"}


func identify_locality_name(pos: Vector2) -> String:
	return str(identify_locality(pos).get("name", "Chennai"))


func to_latlng(pos: Vector2) -> Vector2:
	if source == null:
		return Vector2.ZERO
	var lat := source.latitude - pos.y / (DEG * EARTH_RADIUS)
	var lng := source.longitude + pos.x / (DEG * EARTH_RADIUS * _cos_lat)
	return Vector2(lat, lng)


func from_latlng(lat: float, lng: float) -> Vector2:
	if source == null:
		return Vector2.ZERO
	var x := (lng - source.longitude) * (DEG * EARTH_RADIUS * _cos_lat)
	var z := (source.latitude - lat) * (DEG * EARTH_RADIUS)
	return Vector2(x, z)


func parse_latlng_query(query: String) -> Dictionary:
	if source == null:
		return {}
	var cleaned := query.strip_edges().replace("°N", "").replace("°E", "").replace("°", "").replace(",", " ")
	var parts := cleaned.split(" ", false)
	if parts.size() != 2:
		return {}
	if not parts[0].is_valid_float() or not parts[1].is_valid_float():
		return {}
	var lat := parts[0].to_float()
	var lng := parts[1].to_float()
	if lat < 12.2 or lat > 13.8 or lng < 79.4 or lng > 80.8:
		return {}
	return {"lat": lat, "lng": lng, "pos": from_latlng(lat, lng)}


func find_nearby_pois(pos: Vector2, radius_m: float = 500.0, limit: int = 4) -> Array[Dictionary]:
	var r2 := radius_m * radius_m
	var hits: Array[Dictionary] = []
	for st: Dictionary in rail_stations:
		var sp: Vector2 = st["pos"]
		var d2 := sp.distance_squared_to(pos)
		if d2 <= r2:
			hits.append({"name": str(st["name"]) + " Stn", "kind": "station", "pos": sp, "dist": sqrt(d2)})
	if source != null:
		for lm: Landmark in source.get_landmarks():
			var d2 := lm.position.distance_squared_to(pos)
			if d2 <= r2:
				hits.append({"name": lm.name, "kind": "landmark", "pos": lm.position, "dist": sqrt(d2)})
	for p: Dictionary in all_pois:
		var pp: Vector2 = p["pos"]
		var d2 := pp.distance_squared_to(pos)
		if d2 <= r2:
			hits.append({"name": str(p["name"]), "kind": str(p["kind"]), "pos": pp, "dist": sqrt(d2)})
	hits.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["dist"]) < float(b["dist"]))
	return hits.slice(0, limit)


static func compass_bearing(from_pos: Vector2, to_pos: Vector2) -> Dictionary:
	var d := to_pos - from_pos
	var dist := d.length()
	if dist < 0.1:
		return {"deg": 0, "cardinal": "N", "distance": 0.0}
	var deg := fposmod(rad_to_deg(atan2(d.x, -d.y)), 360.0)
	var dirs: Array[String] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
	var idx := int(round(deg / 45.0)) % 8
	return {"deg": roundi(deg) % 360, "cardinal": dirs[idx], "distance": dist}
