extends SceneTree
## Dumps the road pieces round a point (default Kathipara) with their heights, for the landmark
## specs that detail road decks (G-390). Output: JSON on stdout between DECKS_BEGIN / DECKS_END.
##   godot --headless --path . --script res://tools/landmarks/dump_decks.gd -- X Z RADIUS


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	var centre := Vector2(float(args[0]) if args.size() > 0 else -700.0, float(args[1]) if args.size() > 1 else 8620.0)
	var radius := float(args[2]) if args.size() > 2 else 400.0
	var src := RegionalWorldSource.new()
	var err := src.open()
	if err != "":
		print("error ", err)
		quit(1)
		return
	var out: Array[Dictionary] = []
	for road in src.roads_near(centre, radius):
		var pts: Array = []
		for p in road.points:
			pts.append([snappedf(p.x, 0.01), snappedf(p.y, 0.01)])
		var hs: Array = []
		for h in road.heights:
			hs.append(snappedf(h, 0.01))
		out.append({"id": road.id, "piece": road.piece, "offset_along": snappedf(road.offset_along, 0.01), "name": road.name, "highway": str(road.highway), "kind": str(road.kind), "width": road.width, "lanes": road.lanes, "oneway": road.oneway, "bridge": road.bridge, "tunnel": road.tunnel, "layer": road.layer, "height_step": road.height_step, "heights": hs, "points": pts})
	print("DECKS_BEGIN")
	print(JSON.stringify(out))
	print("DECKS_END")
	quit(0)
