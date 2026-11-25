extends SceneTree
## Prints the benchmark route's paths (G-400) from the regional world data: for each segment a road
## near a point, followed for the segment's length, sampled every 10 m with the road's surface height,
## plus the Chennai Egmore platform from the railway file. Run once when the data changes and paste
## the output into `src/app/benchmark/benchmark_route.gd`:
##
##     godot --headless --audio-driver Dummy --path . --script res://tests/tools/bench_route_finder.gd

const SPECS: Array[Dictionary] = [
	{"id": "morning", "road": "Anna Salai (Mount Road)", "near": Vector2(4940.0, 2915.0), "length": 90.0},
	{"id": "dusk", "road": "Kamarajar Salai", "near": Vector2(7991.7, 3422.5), "length": 110.0},
	{"id": "night", "road": "EVR Periyar Salai", "near": Vector2(6700.0, 400.0), "length": 90.0},
	{"id": "market2", "road": "Ranganathan Street", "near": Vector2(2543.0, 5160.0), "length": 30.0},
	{"id": "market", "road": "Sir Thyagaraya Road", "near": Vector2(2543.0, 5160.0), "length": 30.0},
	{"id": "flyover", "road": "Anna Flyover", "near": Vector2(4369.0, 3721.0), "length": 170.0},
	{"id": "drive", "road": "Anna Salai (Mount Road)", "near": Vector2(5400.0, 2300.0), "length": 400.0},
]


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var kit := CityTestKit.regional_kit()
	for spec in SPECS:
		var near: Vector2 = spec["near"]
		var best: Road = null
		var best_i := 0
		var best_d := INF
		var c0 := kit.source.cell_at(near)
		var roads: Array[Road] = []
		for dx in range(-2, 3):
			for dy in range(-2, 3):
				roads.append_array(kit.layouts.layout_for(c0 + Vector2i(dx, dy)).roads)
		if OS.get_cmdline_user_args().has("--names"):
			var names: Dictionary[String, int] = {}
			for r in kit.layouts.layout_for(c0).roads:
				if r.name != "":
					names[r.name] = names.get(r.name, 0) + 1
			print("%s names: %s" % [spec["id"], names])
		for r in roads:
			if r.name != String(spec["road"]) or r.points.size() < 2:
				continue
			if spec["id"] == "flyover" and not r.is_raised():
				continue
			for i in r.points.size():
				var d := r.points[i].distance_to(near)
				if d < best_d:
					best_d = d
					best = r
					best_i = i
		if best == null:
			print("%s: road not found" % spec["id"])
			continue
		var pts := _follow(kit, best, best_i, float(spec["length"]), spec["id"] == "flyover")
		var line := PackedStringArray()
		for p in pts:
			line.append("Vector3(%.1f, %.2f, %.1f)" % [p.x, p.y, p.z])
		print("%s (%s, %.0f m from the near point, %d points):\n\tPackedVector3Array([%s])" % [spec["id"], best.name, best_d, pts.size(), ", ".join(line)])
	var net := RailNetwork.load_file()
	var l := net.line("beach-tambaram")
	for i in l.stops.size():
		var stop: RailLine.Stop = l.stops[i]
		if stop.name != "Chennai Egmore":
			continue
		var offset := RailRules.PLATFORM_EDGE + stop.width * 0.5
		var h := l.height_at(stop.s) + RailRules.PLATFORM_HEIGHT
		var a := l.path.beside(stop.s + 10.0, float(stop.side) * offset)
		var b := l.path.beside(stop.s + 34.0, float(stop.side) * offset)
		print("platform: Vector3(%.1f, %.2f, %.1f) to Vector3(%.1f, %.2f, %.1f)" % [a.x, h, a.y, b.x, h, b.y])
	quit(0)


## From point `i` of `road`, forward along it and the roads joining its end (same name first, then the
## straightest), `length` metres, every 10 m, heights from the data. For the flyover the walk starts
## 60 m before the deck's first raised point so the path climbs the ramp.
func _follow(kit: ChunkBuilder.Kit, road: Road, i: int, length: float, from_ramp: bool) -> PackedVector3Array:
	var dense: Array[Vector3] = []
	var cur := road
	var start := 0 if from_ramp else i
	for guard in 40:
		for k in range(start, cur.points.size() - 1):
			var a := cur.points[k]
			var b := cur.points[k + 1]
			var steps := maxi(1, ceili(a.distance_to(b) / 2.0))
			for s in steps:
				var t := float(s) / steps
				var q := a.lerp(b, t)
				dense.append(Vector3(q.x, cur.height_at(k, t) if cur.is_raised() else 0.0, q.y))
		start = 0
		var end := cur.points[cur.points.size() - 1]
		var heading := (end - cur.points[cur.points.size() - 2]).normalized()
		var layout := kit.layouts.layout_for(kit.source.cell_at(end))
		var next: Road = null
		var score := 0.3
		for r in layout.roads:
			if r == cur or r.kind == &"footway" or r.points.size() < 2 or r.points[0].distance_to(end) > 0.5:
				continue
			var dot := (r.points[1] - r.points[0]).normalized().dot(heading) + (0.5 if r.name == cur.name else 0.0)
			if dot > score:
				score = dot
				next = r
		if next == null or _run_length(dense) > length + 80.0:
			break
		cur = next
	var out := PackedVector3Array()
	var run := 0.0
	var skip := 0.0
	if from_ramp:
		# Begin 50 m before the first raised point.
		var first_raised := 0.0
		var r2 := 0.0
		for j in dense.size():
			if j > 0:
				r2 += Vector2(dense[j].x, dense[j].z).distance_to(Vector2(dense[j - 1].x, dense[j - 1].z))
			if dense[j].y > 0.05:
				first_raised = r2
				break
		skip = maxf(0.0, first_raised - 50.0)
	var next_at := skip
	for j in dense.size():
		if j > 0:
			run += Vector2(dense[j].x, dense[j].z).distance_to(Vector2(dense[j - 1].x, dense[j - 1].z))
		if run >= next_at:
			out.append(dense[j])
			next_at += 10.0
		if run > skip + length:
			break
	return out


static func _run_length(pts: Array[Vector3]) -> float:
	var total := 0.0
	for j in range(1, pts.size()):
		total += Vector2(pts[j].x, pts[j].z).distance_to(Vector2(pts[j - 1].x, pts[j - 1].z))
	return total
