extends SceneTree
## Lists the named roads near a point of the world, for placing new missions (G-145). Run:
## godot --headless --audio-driver Dummy --path . --script res://tools/rules/explore_roads.gd -- x z [radius]

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var p := Vector2(float(args[0]), float(args[1]))
	var radius := float(args[2]) if args.size() > 2 else 400.0
	var source := FileWorldSource.new()
	var err := source.open()
	if err != "":
		printerr(err)
		quit(1)
		return
	var seen := {}
	for road in source.loaded_roads().roads:
		if road.kind == &"footway" or road.name == "":
			continue
		var best := INF
		for i in range(road.points.size() - 1):
			var q := Geometry2D.get_closest_point_to_segment(p, road.points[i], road.points[i + 1])
			best = minf(best, q.distance_to(p))
		if best <= radius:
			var key := "%s [%s w%.0f]" % [road.name, road.kind, road.width]
			seen[key] = minf(float(seen.get(key, INF)), best)
	var keys := seen.keys()
	keys.sort_custom(func(a: Variant, b: Variant) -> bool: return float(seen[a]) < float(seen[b]))
	for k: Variant in keys.slice(0, 14):
		print("  %5.0f m  %s" % [seen[k], k])
	quit(0)
