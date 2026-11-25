extends TestCase
## The low-poly props (G-433): every face winds the way Godot draws it, the weapons are cheap,
## one material and texture are shared by all of them.


func _faces_outwards(m: ArrayMesh) -> bool:
	var a := m.surface_get_arrays(0)
	var v: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
	var n: PackedVector3Array = a[Mesh.ARRAY_NORMAL]
	var idx: PackedInt32Array = a[Mesh.ARRAY_INDEX]
	for t in idx.size() / 3:
		var i0 := idx[t * 3]
		var i1 := idx[t * 3 + 1]
		var i2 := idx[t * 3 + 2]
		var geo := (v[i1] - v[i0]).cross(v[i2] - v[i0])
		# Godot's front faces are clockwise: the right-hand normal points into the object.
		if geo.dot(n[i0]) >= 0.0:
			return false
	return true


func test_faces_wind_clockwise_for_every_weapon_and_the_boxes() -> bool:
	for id in WeaponModels.IDS:
		check(_faces_outwards(WeaponModels.mesh(id)), "%s: faces are front-facing" % id)
	return true


func test_weapons_are_cheap() -> bool:
	for id in WeaponModels.IDS:
		var tris := WeaponModels.triangles(id)
		check(tris > 0 and tris <= 160, "%s: %d triangles" % [id, tris])
	return true


func test_all_weapons_share_one_material_and_one_texture() -> bool:
	var mat := LowPoly.material()
	for id in WeaponModels.IDS:
		check(WeaponModels.mesh(id).surface_get_material(0) == mat, "%s uses the shared material" % id)
	check(mat.albedo_texture == LowPoly.texture(), "one texture")
	check(LowPoly.texture().get_width() <= 16, "a 16-colour palette image, no download")
	return true


func test_the_bat_is_a_bat_sized_thing() -> bool:
	var box := WeaponModels.mesh(&"bat").get_aabb()
	check(box.size.z > 0.75 and box.size.z < 0.95, "bat length %.2f m" % box.size.z)
	check(box.size.x < 0.13, "bat width %.2f m" % box.size.x)
	var stick := WeaponModels.mesh(&"stick").get_aabb()
	check(stick.size.z > 0.85 and stick.size.z < 1.1, "stick length %.2f m" % stick.size.z)
	var bottle := WeaponModels.mesh(&"bottle").get_aabb()
	check(bottle.size.z > 0.25 and bottle.size.z < 0.45, "bottle length %.2f m" % bottle.size.z)
	return true
