extends SceneTree
## Lists purchasable-home candidates round an area centre (G-230): residential OSM buildings of
## a size a home could have, with a road close in front. Used once to fill data/homes/listings.json.
##     godot --headless --path . --script res://tests/tools/home_picker.gd -- --at=x,z --kind=house

func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var at := Vector2.ZERO
	var kind := "house"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--at="):
			var p := arg.trim_prefix("--at=").split(",")
			at = Vector2(float(p[0]), float(p[1]))
		elif arg.begins_with("--kind="):
			kind = arg.trim_prefix("--kind=")
	var source := RegionalWorldSource.new()
	print(source.open())
	var rows: Array[Dictionary] = []
	for cell in source.chunks_near(at, 260.0):
		var chunk := source.read_chunk(cell)
		for b in chunk.buildings:
			if str(b.kind) != kind:
				continue
			var c := Vector2.ZERO
			for q in b.outline:
				c += q
			c /= float(b.outline.size())
			if c.distance_to(at) > 260.0:
				continue
			var area := absf(_area(b.outline))
			rows.append({"id": b.id, "c": c, "area": area, "h": b.height, "floors": b.floors, "from": str(b.height_from), "src": b.source_id, "n": b.outline.size()})
	rows.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return (a["c"] as Vector2).distance_to(at) < (b["c"] as Vector2).distance_to(at))
	var shown := 0
	for r in rows:
		var a: float = r["area"]
		if a < 70.0 or a > 600.0 or int(r["n"]) > 12:
			continue
		var roads := source.roads_near(r["c"], 30.0)
		var best := INF
		for road in roads:
			if road.kind == &"footway":
				continue
			for i in range(road.points.size() - 1):
				best = minf(best, Geometry2D.get_closest_point_to_segment(r["c"], road.points[i], road.points[i + 1]).distance_to(r["c"]))
		if best > 28.0:
			continue
		print("id=%d c=(%.1f,%.1f) area=%.0f h=%.1f fl=%d %s road=%.1f n=%d src=%d" % [r["id"], r["c"].x, r["c"].y, a, r["h"], r["floors"], r["from"], best, r["n"], r["src"]])
		shown += 1
		if shown >= 14:
			break
	quit(0)


static func _area(pts: PackedVector2Array) -> float:
	var s := 0.0
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		s += a.x * b.y - b.x * a.y
	return s / 2.0
