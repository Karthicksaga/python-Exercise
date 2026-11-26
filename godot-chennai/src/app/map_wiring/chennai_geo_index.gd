class_name ChennaiGeoIndex
extends RefCounted
## Read-only offline geographical index for Greater Chennai.
## Reuses an existing `RegionalWorldSource` when provided (from `CityWorld`), or opens
## `res://world/` read-only, plus `res://data/areas/areas.json` and `res://world/rail/rail.json`.
## Never modifies or regenerates any world files.

const AREAS_JSON := "res://data/areas/areas.json"
const RAIL_JSON := "res://world/rail/rail.json"
const METRO_JSON := "res://data/geo/metro.json"
const ROAD_TAGS_JSON := "res://data/geo/road_tags_ta.json"
const AREAS_MAGIC := 0x41574f43  # "COWA"
const EARTH_RADIUS := 6371008.8
const DEG := PI / 180.0
const MAX_SEARCH_CACHE_TILES := 16

var source: RegionalWorldSource = null
var loaded := false
var error := ""

var areas_meta: Array[Dictionary] = []
var rail_tracks: Array[PackedVector2Array] = []
var rail_track_systems: Array[String] = []
var rail_stations: Array[Dictionary] = []
var metro_tracks: Array[Dictionary] = []
var metro_stations: Array[Dictionary] = []
var road_tags: Dictionary[String, Dictionary] = {}

var all_districts: Array[Dictionary] = []
var all_pois: Array[Dictionary] = []
var all_bus_stops: Array[Dictionary] = []
var all_road_names: Array[Dictionary] = []
var _road_name_map: Dictionary[String, int] = {}

var _tile_areas: Dictionary[Vector2i, Array] = {}
var _district_cells: Dictionary[Vector2i, Array] = {}
var _road_centroids: Dictionary[String, Vector2] = {}
var _cos_lat := 1.0


func open(existing_source: RegionalWorldSource = null) -> String:
	if loaded:
		return error
	if existing_source != null:
		source = existing_source
	else:
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
	_load_metro()
	_load_road_tags()
	_index_all_tiles()
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
		var item := item_var as Dictionary
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
			var tr := tr_var as Dictionary
			var pts_var: Variant = tr.get("points", [])
			if not (pts_var is Array):
				continue
			var poly := PackedVector2Array()
			for pt_var: Variant in (pts_var as Array):
				if pt_var is Array and (pt_var as Array).size() >= 2:
					var pt := pt_var as Array
					poly.append(Vector2(float(pt[0]), float(pt[1])))
			if poly.size() >= 2:
				rail_tracks.append(poly)
				rail_track_systems.append(str(tr.get("system", "suburban")))
	var st_var: Variant = d.get("stations", [])
	if st_var is Array:
		for s_var: Variant in (st_var as Array):
			if not (s_var is Dictionary):
				continue
			var s := s_var as Dictionary
			var nm := str(s.get("name", ""))
			if nm == "":
				continue
			rail_stations.append({
				"name": nm,
				"name_ta": str(s.get("tamil", "")),
				"pos": Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0))),
				"system": str(s.get("system", "suburban")),
			})


func _load_metro() -> void:
	metro_tracks.clear()
	metro_stations.clear()
	if not FileAccess.file_exists(METRO_JSON):
		return
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(METRO_JSON)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return
	var d: Dictionary = json.data
	for tr_var: Variant in (d.get("tracks", []) as Array):
		if not (tr_var is Dictionary):
			continue
		var tr := tr_var as Dictionary
		var poly := PackedVector2Array()
		for pt_var: Variant in (tr.get("points", []) as Array):
			if pt_var is Array and (pt_var as Array).size() >= 2:
				var pt := pt_var as Array
				poly.append(Vector2(float(pt[0]), float(pt[1])))
		if poly.size() >= 2:
			metro_tracks.append({
				"points": poly,
				"colour": str(tr.get("colour", "")),
				"name": str(tr.get("name", "")),
			})
	for s_var: Variant in (d.get("stations", []) as Array):
		if not (s_var is Dictionary):
			continue
		var s := s_var as Dictionary
		var nm := str(s.get("name", ""))
		if nm == "":
			continue
		metro_stations.append({
			"name": nm,
			"name_ta": str(s.get("name_ta", "")),
			"line": str(s.get("line", "metro")),
			"pos": Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0))),
		})


func _load_road_tags() -> void:
	road_tags.clear()
	if not FileAccess.file_exists(ROAD_TAGS_JSON):
		return
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(ROAD_TAGS_JSON)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return
	var d: Dictionary = json.data
	var r_dict: Variant = d.get("roads", {})
	if r_dict is Dictionary:
		for k: Variant in (r_dict as Dictionary):
			var v: Variant = (r_dict as Dictionary)[k]
			if v is Dictionary:
				road_tags[str(k)] = v as Dictionary


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
			var entry := {"name": d.name, "name_ta": _tamil_for_area(d.name), "kind": String(d.kind), "pos": d.position}
			all_districts.append(entry)
			var cell := Vector2i(floori(d.position.x / 1000.0), floori(d.position.y / 1000.0))
			if not _district_cells.has(cell):
				_district_cells[cell] = []
			(_district_cells[cell] as Array).append(entry)
		for p: Place in idx.pois:
			if p.name == "":
				continue
			all_pois.append({"name": p.name, "kind": String(p.kind), "pos": p.position})
		for bs: Place in idx.bus_stops:
			if bs.name == "":
				continue
			all_bus_stops.append({"name": bs.name, "pos": bs.position})
		for rn: String in idx.road_names:
			if rn == "":
				continue
			if _road_name_map.has(rn):
				var entry_idx := _road_name_map[rn]
				var tlist: Array = all_road_names[entry_idx]["tiles"]
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


func ensure_tile(tile: Vector2i, decode_areas: bool = true) -> void:
	if source == null or not source.tiles.has(tile):
		return
	var net := source.tile_roads(tile)
	if net != null:
		_index_road_centroids(tile, net)
	if decode_areas and not _tile_areas.has(tile):
		_tile_areas[tile] = _decode_tile_areas(tile)


func _index_road_centroids(tile: Vector2i, net: RoadNetwork) -> void:
	var prefix := "%d_%d|" % [tile.x, tile.y]
	var marker_key := prefix + "__indexed__"
	if _road_centroids.has(marker_key):
		return
	_road_centroids[marker_key] = Vector2.ZERO
	for road: Road in net.roads:
		if road.name == "" or road.points.is_empty():
			continue
		var key := prefix + road.name
		if not _road_centroids.has(key):
			_road_centroids[key] = road.points[road.points.size() / 2]


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
		r.u32()
		r.u8()
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
			out.append({"kind": kind, "outline": outline, "box": Rect2(lo, hi - lo)})
	return out


func search(query: String, player_pos: Vector2, limit: int = 20) -> Array[Dictionary]:
	var q := query.strip_edges().to_lower()
	var results: Array[Dictionary] = []
	if q == "":
		if source != null:
			for lm: Landmark in source.get_landmarks():
				results.append({
					"name": lm.name,
					"name_ta": _tamil_for_area(lm.name),
					"category": "Landmark",
					"locality": identify_locality_name(lm.position),
					"pos": lm.position,
					"distance": lm.position.distance_to(player_pos),
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
				"distance": ap.distance_to(player_pos),
				"score": 9,
			})
		for st: Dictionary in rail_stations.slice(0, 6):
			var sp: Vector2 = st["pos"]
			results.append({
				"name": str(st["name"]) + " Station",
				"name_ta": str(st["name_ta"]),
				"category": "Railway Station",
				"locality": identify_locality_name(sp),
				"pos": sp,
				"distance": sp.distance_to(player_pos),
				"score": 8,
			})
		return results.slice(0, limit)

	var gps := parse_latlng_query(query)
	if not gps.is_empty():
		var gp: Vector2 = gps["pos"]
		results.append({
			"name": "%.5f°N, %.5f°E" % [float(gps["lat"]), float(gps["lng"])],
			"name_ta": "",
			"category": "GPS Coordinate",
			"locality": identify_locality_name(gp),
			"pos": gp,
			"distance": gp.distance_to(player_pos),
			"score": 200,
		})

	if source != null:
		for lm: Landmark in source.get_landmarks():
			var sc := _match_score(q, lm.name, _tamil_for_area(lm.name), String(lm.kind))
			if sc > 0:
				results.append({
					"name": lm.name,
					"name_ta": _tamil_for_area(lm.name),
					"category": "Landmark",
					"locality": identify_locality_name(lm.position),
					"pos": lm.position,
					"distance": lm.position.distance_to(player_pos),
					"score": sc + 40,
				})

	for a: Dictionary in areas_meta:
		var nm := str(a["name"])
		var ta := str(a["name_ta"])
		var sc := _match_score(q, nm, ta, "locality")
		if sc > 0:
			var ap: Vector2 = a["pos"]
			results.append({
				"name": nm,
				"name_ta": ta,
				"category": "Locality",
				"locality": "Greater Chennai",
				"pos": ap,
				"distance": ap.distance_to(player_pos),
				"score": sc + 35,
			})

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
				"distance": sp.distance_to(player_pos),
				"score": sc + 30,
			})

	for st: Dictionary in metro_stations:
		var nm := str(st["name"])
		var ta := str(st["name_ta"])
		var sc := _match_score(q, nm + " metro station", ta, "metro station subway")
		if sc > 0:
			var sp: Vector2 = st["pos"]
			results.append({
				"name": nm + " Metro",
				"name_ta": ta,
				"category": "Metro Station",
				"locality": identify_locality_name(sp),
				"pos": sp,
				"distance": sp.distance_to(player_pos),
				"score": sc + 32,
			})

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
				"distance": dp.distance_to(player_pos),
				"score": sc + 24,
			})

	for rn_entry: Dictionary in all_road_names:
		var rname := str(rn_entry["name"])
		var rmeta: Dictionary = road_tags.get(rname, {})
		var rta := str(rmeta.get("ta", ""))
		var ralt := str(rmeta.get("official", "")) + " " + str(rmeta.get("alt", ""))
		var sc := _match_score(q, rname + " " + ralt, rta, "road street avenue salai")
		if sc > 0:
			var tiles_arr: Array = rn_entry["tiles"]
			var first_tile: Vector2i = tiles_arr[0]
			var loc := _road_centroid_fast(first_tile, rname)
			var approx_pos: Vector2 = loc["pos"]
			results.append({
				"name": rname,
				"name_ta": rta,
				"category": "Street / Road",
				"locality": identify_locality_name(approx_pos),
				"pos": approx_pos,
				"tile": first_tile,
				"road_name": rname,
				"distance": approx_pos.distance_to(player_pos),
				"score": sc + 20,
			})

	for p: Dictionary in all_pois:
		var nm := str(p["name"])
		var kind := str(p["kind"])
		var sc := _match_score(q, nm, "", kind)
		if sc > 0:
			var pp: Vector2 = p["pos"]
			results.append({
				"name": nm,
				"name_ta": "",
				"category": kind.replace("_", " ").capitalize(),
				"locality": identify_locality_name(pp),
				"pos": pp,
				"distance": pp.distance_to(player_pos),
				"score": sc + 12,
			})

	results.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		var sa := int(a["score"])
		var sb := int(b["score"])
		if sa != sb:
			return sa > sb
		return float(a["distance"]) < float(b["distance"])
	)
	var out: Array[Dictionary] = []
	var seen: Dictionary[String, bool] = {}
	for r: Dictionary in results:
		var k := str(r["name"]).to_lower() + "|" + str(r["category"])
		if seen.has(k):
			continue
		seen[k] = true
		out.append(r)
		if out.size() >= limit:
			break
	return out


func resolve_road_position(road_name: String, tile: Vector2i) -> Vector2:
	ensure_tile(tile, false)
	var key := "%d_%d|%s" % [tile.x, tile.y, road_name]
	if _road_centroids.has(key):
		return _road_centroids[key]
	if source != null and source.tiles.has(tile):
		return source.tile_rect(tile).get_center()
	return Vector2.ZERO


func _road_centroid_fast(tile: Vector2i, road_name: String) -> Dictionary:
	var key := "%d_%d|%s" % [tile.x, tile.y, road_name]
	if _road_centroids.has(key):
		return {"pos": _road_centroids[key], "exact": true}
	if source != null and source.tiles.has(tile):
		return {"pos": source.tile_rect(tile).get_center(), "exact": false}
	return {"pos": Vector2.ZERO, "exact": false}


static func _match_score(q: String, name_en: String, name_ta: String, kind: String) -> int:
	var en := name_en.to_lower()
	var ta := name_ta.to_lower()
	var kd := kind.to_lower()
	if en == q or (ta != "" and ta == q):
		return 100
	if en.begins_with(q) or (ta != "" and ta.begins_with(q)):
		return 75
	if en.contains(q) or (ta != "" and ta.contains(q)):
		return 50
	if kd.contains(q):
		return 20
	return 0


func identify_street(pos: Vector2, previous_name: String = "") -> Dictionary:
	if source == null:
		return {}
	var tile := source.tile_at(pos)
	ensure_tile(tile, false)
	var net := source.tile_roads(tile)
	if net == null or net.roads.is_empty():
		return {}

	var best_road: Road = null
	var best_d2 := 65.0 * 65.0
	var prev_road: Road = null
	var prev_d2 := INF

	for road: Road in net.roads:
		if road.kind == &"footway" or road.points.size() < 2:
			continue
		var d2 := _road_dist_sq(pos, road.points)
		if previous_name != "" and road.name == previous_name and d2 < prev_d2:
			prev_d2 = d2
			prev_road = road
		if road.name != "" and d2 < best_d2:
			best_d2 = d2
			best_road = road

	if prev_road != null and prev_d2 <= 32.0 * 32.0 and best_road != null and prev_d2 < best_d2 * 1.8:
		return _road_info(prev_road)
	if best_road != null:
		return _road_info(best_road)
	return {}


func _road_info(road: Road) -> Dictionary:
	var rmeta: Dictionary = road_tags.get(road.name, {})
	return {
		"name": road.name,
		"name_ta": str(rmeta.get("ta", "")),
		"official_name": str(rmeta.get("official", "")),
		"alt_name": str(rmeta.get("alt", "")),
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
