extends SceneTree
## Bisect harness (not committed): boots the real Main, goes to a place, warms up and measures.
## godot [--headless] --path . --script res://perf_bisect.gd -- --start=play --place=t_nagar --frames=300

const PLACES := {
	"spawn": Vector2.ZERO,
	"t_nagar": Vector2(2543.0, 5160.0),
	"mylapore": Vector2(6556.0, 5706.0),
	"marina": Vector2(7991.7, 3422.5),
	"anna_salai": Vector2(4940.0, 2915.0),
}

var _t0: int = 0


func _initialize() -> void:
	_t0 = Time.get_ticks_msec()
	_run.call_deferred()


func _arg(name: String, fallback: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--%s=" % name):
			return a.trim_prefix("--%s=" % name)
	return fallback


func _rss_mb() -> float:
	var f := FileAccess.open("/proc/self/status", FileAccess.READ)
	if f == null:
		return -1.0
	for line in f.get_as_text().split("\n"):
		if line.begins_with("VmRSS:"):
			return float(line.split(":")[1].strip_edges().split(" ")[0]) / 1024.0
	return -1.0


func _run() -> void:
	var place := _arg("place", "spawn")
	var frames := int(_arg("frames", "300"))
	var title_mode := not OS.get_cmdline_user_args().has("--start=play")
	var main: Node = (load("res://src/app/main.tscn") as PackedScene).instantiate()
	root.add_child(main)
	var want := "title" if title_mode else "play"
	var first_frame := -1
	Engine.max_fps = 240
	while String(main.get("state")) != want and Time.get_ticks_msec() - _t0 < 600000:
		await process_frame
		if first_frame < 0:
			first_frame = Time.get_ticks_msec() - _t0
		if String(main.get("state")) == "failed":
			print("BISECT failed to load")
			quit(1)
			return
	var to_state := Time.get_ticks_msec() - _t0
	var world: Node = main.get("world")
	var origin: Node = root.get_node("/root/WorldOrigin")
	if not title_mode and place != "spawn":
		var rig: Node = main.get("rig")
		var hit: Dictionary = await _nearest(world, PLACES[place])
		var p: Vector2 = hit.get("point", PLACES[place])
		var h: float = float(hit.get("heading", 0.0))
		origin.call("recentre", p.x, p.y)
		rig.call("place", origin.call("to_scene", p, 0.05), h)
		var ok: bool = await world.call("wait_ready_around", p, -1.0, 240 * 600)
		if not ok:
			print("BISECT place not ready")
		var cam: Object = rig.get("camera")
		if cam != null and cam.has_method("snap"):
			cam.call("snap")
	for i in 600:
		await physics_frame
	Engine.max_fps = 0
	var life: Object = main.get("life") if "life" in main else null
	if life != null and life.has_method("reset_stats"):
		life.call("reset_stats")
	var wall := PackedFloat64Array()
	var proc := PackedFloat64Array()
	var phys := PackedFloat64Array()
	var draws := 0
	var prims := 0
	var objs := 0
	var last := Time.get_ticks_usec()
	for i in frames:
		await process_frame
		var now := Time.get_ticks_usec()
		wall.append((now - last) / 1000.0)
		last = now
		proc.append(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
		phys.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0)
		draws += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		prims += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		objs += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var census := {"bodies": 0, "shapes": 0, "concave_faces": 0, "meshes_vis": 0, "shadow_casters_vis": 0, "mm_instances_vis": 0, "lights": 0, "anim_players": 0, "skeletons": 0}
	_walk(root, census)
	var out := {
		"place": place, "mode": want, "to_state_ms": to_state, "first_frame_ms": first_frame,
		"wall_ms": _avg(wall), "over50": _over(wall, 50.0), "over33": _over(wall, 33.0), "wall_p95": _pct(wall, 0.95), "wall_max": _pct(wall, 1.0),
		"process_ms": _avg(proc), "physics_ms": _avg(phys),
		"draws": draws / frames, "prims": prims / frames, "objects": objs / frames,
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"tex_mb": Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED) / 1048576.0,
		"vram_mb": Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0,
		"buf_mb": Performance.get_monitor(Performance.RENDER_BUFFER_MEM_USED) / 1048576.0,
		"static_mb": Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0,
		"rss_mb": _rss_mb(),
		"active_bodies": Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS),
		"pairs": Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS),
	}
	out.merge(census)
	if world != null:
		var st: Object = world.get("streamer")
		var s: Dictionary = st.get("stats")
		out["chunks_built"] = s.get("built", 0)
		out["max_build_ms"] = int(s.get("max_build_usec", 0)) / 1000.0
		out["stream_max_frame_ms"] = int(s.get("max_frame_usec", 0)) / 1000.0
	if life != null:
		var ls: Dictionary = life.get("stats")
		var n := maxi(1, int(ls.get("frames", 0)))
		out["life_sync_ms"] = int(ls.get("sync_total", 0)) / 1000.0 / n
		out["life_wait_ms"] = int(ls.get("wait_total", 0)) / 1000.0 / n
		out["ai_step_ms"] = int(ls.get("step_total", 0)) / 1000.0 / maxi(1, int(ls.get("steps", 0)))
		out["life_counts"] = life.call("counts")
	print("BISECT " + JSON.stringify(out))
	print("STREAM " + JSON.stringify((world.get("streamer") as Object).get("stats")))
	quit(0)


func _nearest(world: Node, p: Vector2) -> Dictionary:
	var t := Thread.new()
	t.start(func() -> Dictionary: return world.call("nearest_road_point", p))
	while t.is_alive():
		await process_frame
	return t.wait_to_finish()


func _walk(n: Node, c: Dictionary) -> void:
	if n is CollisionObject3D:
		c["bodies"] += 1
	elif n is CollisionShape3D:
		c["shapes"] += 1
		var sh := (n as CollisionShape3D).shape
		if sh is ConcavePolygonShape3D:
			c["concave_faces"] += (sh as ConcavePolygonShape3D).get_faces().size() / 3
	elif n is GeometryInstance3D:
		var g := n as GeometryInstance3D
		if g.is_visible_in_tree():
			c["meshes_vis"] += 1
			if g.cast_shadow != GeometryInstance3D.SHADOW_CASTING_SETTING_OFF:
				c["shadow_casters_vis"] += 1
			if g is MultiMeshInstance3D and (g as MultiMeshInstance3D).multimesh != null:
				c["mm_instances_vis"] += (g as MultiMeshInstance3D).multimesh.instance_count
	elif n is Light3D:
		if (n as Light3D).is_visible_in_tree():
			c["lights"] += 1
	elif n is AnimationPlayer:
		c["anim_players"] += 1
	elif n is Skeleton3D:
		c["skeletons"] += 1
	for ch in n.get_children():
		_walk(ch, c)


func _over(a: PackedFloat64Array, ms: float) -> int:
	var n := 0
	for v in a:
		if v > ms:
			n += 1
	return n


func _avg(a: PackedFloat64Array) -> float:
	var s := 0.0
	for v in a:
		s += v
	return s / maxf(1.0, float(a.size()))


func _pct(a: PackedFloat64Array, q: float) -> float:
	var b := a.duplicate()
	b.sort()
	return b[clampi(int(q * (b.size() - 1)), 0, b.size() - 1)] if b.size() > 0 else 0.0
