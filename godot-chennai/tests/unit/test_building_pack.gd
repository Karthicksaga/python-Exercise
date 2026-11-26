extends TestCase
## Verifies the Stage-8 BuildingPack runtime loader, binary lookup, landmark protection
## boundaries, and deterministic ChunkBuilder replacement path.


func test_lookup_header_and_protection_guards() -> bool:
	assert_true(BuildingPack.available(), "lookup.bin exists")
	var pack := BuildingPack.load_pack(false)
	assert_eq(pack.error, "", "lookup parses cleanly: %s" % pack.error)
	assert_eq(pack.asset_ids.size(), 100, "all 100 archetypes indexed")
	# Custom landmarks (Chennai Central, Egmore, Kapaleeshwarar Temple, Ripon Building) must NEVER match:
	for protected_id: int in [217845073, 214739119, 209558519, 1548155931, 27618298, 651861526, 211436935, 154030370]:
		assert_true(pack.is_protected(protected_id), "protected landmark %d flagged" % protected_id)
		assert_eq(pack.asset_index_for(protected_id), -1, "protected landmark %d never maps to pack_100" % protected_id)
	return true


func test_chunk_builder_replaces_without_overlap() -> bool:
	var kit := CityTestKit.regional_kit()
	kit.building_pack = BuildingPack.load_pack(true)
	assert_eq(kit.building_pack.error, "", "GLBs load cleanly")
	var cell := kit.source.cell_at(Vector2(266.9, -16.3))
	var b1 := ChunkBuilder.build(kit, cell)
	var b2 := ChunkBuilder.build(kit, cell)
	assert_eq(b1.error, "", "chunk builds with building_pack")
	assert_true(int(b1.detail.get("pack100_replaced", 0)) > 0, "pack100 replaced eligible buildings")
	assert_eq(b1.triangles, b2.triangles, "chunk triangles deterministic with pack100")
	var holder := b1.view.get_node_or_null(^"Near/PackBuildings") as BuildingPack.Batch
	assert_true(holder != null, "Near/PackBuildings created as BuildingPack.Batch")
	assert_true(b1.view.get_node_or_null(^"Near/PackMid") == null, "Near/PackMid omitted to prevent visibility gaps and z-fighting")
	assert_true(b1.view.get_node_or_null(^"Far/PackFar") != null, "Far/PackFar created for ChunkStreamer far look")
	assert_true(holder.get_child_count() > 0, "MultiMeshInstance3D children created")
	var checked_mmi := false
	var visible_instances := 0
	for child in holder.get_children():
		var mmi := child as MultiMeshInstance3D
		assert_true(mmi != null, "child is MultiMeshInstance3D")
		visible_instances += mmi.multimesh.visible_instance_count
		if not checked_mmi:
			assert_eq(mmi.visibility_range_begin, 0.0, "no per-node visibility_range_begin inside Near")
			assert_eq(mmi.visibility_range_end, 0.0, "no per-node visibility_range_end inside Near")
			assert_true(mmi.custom_aabb.size.length() > 1.0, "custom_aabb set on MultiMeshInstance3D")
			assert_true(mmi.multimesh.custom_aabb.size.length() > 1.0, "custom_aabb set on MultiMesh")
			checked_mmi = true
	assert_eq(visible_instances, int(b1.detail.get("pack100_replaced", 0)), "every replaced building drawn once across LOD0/LOD1")
	holder.refresh(Vector3(0.0, 2.0, 0.0))
	var after_refresh := 0
	for child in holder.get_children():
		after_refresh += (child as MultiMeshInstance3D).multimesh.visible_instance_count
	assert_eq(after_refresh, visible_instances, "no building dropped or doubled after LOD refresh")
	CityTestKit.free_build(b1)
	CityTestKit.free_build(b2)
	kit.building_pack = null
	return true
