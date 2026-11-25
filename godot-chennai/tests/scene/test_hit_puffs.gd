extends TestCase
## Hit puffs (G-432): a pooled MultiMesh of quads that never grows, costs nothing while no blow
## shows, and lives for the Three.js times (flash 0.12 s, dust 0.4 s).

const DT := 1.0 / 60.0

var puffs: HitPuffs


func before_each() -> void:
	puffs = HitPuffs.new()
	puffs.auto_advance = false
	puffs.pool = 6
	root.add_child(puffs)
	puffs._build()


func _run(seconds: float) -> void:
	for i in roundi(seconds / DT):
		puffs.advance(DT)


func test_nothing_is_drawn_until_a_blow_lands() -> bool:
	check(not puffs.view.visible, "hidden with no blow")
	check(not puffs.is_processing(), "not processing")
	check(puffs.showing() == 0, "none showing")
	puffs.spawn(Vector3(1, 1, 1), Vector3.UP, 1.0)
	check(puffs.view.visible and puffs.showing() == 1, "one blow shows")
	_run(HitPuffs.DUST_TIME + 0.05)
	check(puffs.showing() == 0 and not puffs.view.visible, "and is gone after 0.4 s")
	return true


func test_the_flash_is_over_in_a_tenth_of_a_second_the_dust_lasts_longer() -> bool:
	puffs.spawn(Vector3.ZERO, Vector3.BACK, 1.0)
	_run(0.05)
	check(puffs.flash_alpha(0) > 0.3, "the flash still bright at 0.05 s (%.2f)" % puffs.flash_alpha(0))
	check(puffs.ring_alpha(0) > 0.3, "dust visible (%.2f)" % puffs.ring_alpha(0))
	_run(0.1)
	check(puffs.flash_alpha(0) == 0.0, "flash gone by 0.15 s")
	check(puffs.ring_alpha(0) > 0.05, "dust still there")
	var grown := puffs.ring_transform(0).basis.get_scale().x
	check(grown > 0.4, "the dust has spread (%.2f m)" % grown)
	return true


func test_the_puff_is_where_the_blow_landed_and_leans_on_the_surface() -> bool:
	var at := Vector3(3, 1.2, -4)
	puffs.spawn(at, Vector3.RIGHT, 1.0)
	var t := puffs.ring_transform(0)
	check(t.origin.distance_to(at) < 0.1, "ring at the contact point (%.3f m)" % t.origin.distance_to(at))
	_run(0.2)
	var drift := puffs.ring_transform(0).origin - at
	check(drift.dot(Vector3.RIGHT) > 0.03, "the dust drifts out along the surface normal (%.2f m)" % drift.dot(Vector3.RIGHT))
	var f := puffs.flash_transform(0)
	check(f.origin.distance_to(at) < 0.12, "flash at the contact point")
	return true


func test_the_pool_never_grows_after_warm_up_and_reuses_the_oldest() -> bool:
	var count := puffs.multi.instance_count
	var children := puffs.get_child_count()
	for i in 30:
		puffs.spawn(Vector3(i, 1, 0), Vector3.UP, 1.0)
		puffs.advance(DT)
	var objects_before := Performance.get_monitor(Performance.OBJECT_COUNT)
	var nodes_before := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	for i in 300:
		puffs.spawn(Vector3(i, 1, 0), Vector3.UP, 1.0 + float(i % 3) * 0.3)
		puffs.advance(DT)
	check(puffs.multi.instance_count == count and count == puffs.pool * 2, "instance count fixed (%d)" % count)
	check(puffs.get_child_count() == children, "no node added")
	check(puffs.showing() <= puffs.pool, "at most the pool shows (%d)" % puffs.showing())
	check(Performance.get_monitor(Performance.OBJECT_COUNT) <= objects_before + 2.0, "no objects made while spawning (%d to %d)" % [objects_before, Performance.get_monitor(Performance.OBJECT_COUNT)])
	check(Performance.get_monitor(Performance.OBJECT_NODE_COUNT) == nodes_before, "no nodes made")
	# Six busy puffs; a seventh takes the oldest one's place.
	check(puffs.showing() == puffs.pool, "all %d in use" % puffs.pool)
	return true


func test_one_draw_call_one_shared_texture() -> bool:
	var mat := (puffs.multi.mesh as QuadMesh).material as ShaderMaterial
	check(mat != null and mat.get_shader_parameter(&"atlas") is ImageTexture, "one atlas texture")
	var second := HitPuffs.new()
	second.pool = 2
	root.add_child(second)
	second._build()
	var mat2 := (second.multi.mesh as QuadMesh).material as ShaderMaterial
	check(mat.get_shader_parameter(&"atlas") == mat2.get_shader_parameter(&"atlas"), "the texture is shared by every pool")
	check(mat.shader == mat2.shader, "and the shader")
	return true


func test_the_pool_follows_the_quality_level() -> bool:
	var low := QualitySettings.values(QualitySettings.LOW)
	var high := QualitySettings.values(QualitySettings.HIGH)
	check(int(low["hit_puffs"]) < int(high["hit_puffs"]), "fewer puffs on Low (%d, High %d)" % [int(low["hit_puffs"]), int(high["hit_puffs"])])
	check(int(high["hit_puffs"]) <= HitPuffs.MAX_POOL, "never above the maximum")
	return true


func test_the_shader_compiles_and_the_atlas_has_a_ring_and_a_star() -> bool:
	var tex := (((puffs.multi.mesh as QuadMesh).material as ShaderMaterial).get_shader_parameter(&"atlas") as ImageTexture).get_image()
	check(tex.get_width() == 128 and tex.get_height() == 64, "128 x 64 atlas")
	check(tex.get_pixel(32, 32).a < 0.35, "ring: hazy in the middle")
	check(tex.get_pixel(32 + 20, 32).a > 0.5, "ring: dense at its radius")
	check(tex.get_pixel(64 + 32, 32).a > 0.9, "star: bright core")
	check(tex.get_pixel(64 + 32 + 20, 32).a > 0.2, "star: a point along the axis")
	check(tex.get_pixel(64 + 32 + 14, 32 + 14).a < 0.2, "star: dark between its points")
	return true
