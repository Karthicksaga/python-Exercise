extends SceneTree
func _initialize() -> void:
	_run.call_deferred()
func _run() -> void:
	await process_frame
	var src := FileWorldSource.new()
	src.open()
	var layouts := CityLayouts.create(src)
	var cell := src.cell_at(Vector2(40, 60))
	var g := GroundMeshes.new()
	var layout := layouts.layout_for(cell)
	g.origin = ChunkBuilder.centre_of(src, cell)
	var chunk := src.read_chunk(cell)
	print("spans ", layout.spans_in(cell).size(), " cell ", cell)
	g.build(layout.spans_in(cell), chunk.areas, Rect2(src.get_grid_origin() + Vector2(cell) * 250.0, Vector2(250, 250)), [] as Array[StreetFurniture.KerbRun])
	var counts := {}
	for i in range(0, g.mesh.indices.size(), 3):
		var l := int(round(g.mesh.colors[g.mesh.indices[i]].a * 16.0))
		counts[l] = counts.get(l, 0) + 1
	print(counts)
	var lo := Vector3(INF, INF, INF)
	var hi := -lo
	for i in range(0, g.mesh.indices.size()):
		var v := g.mesh.positions[g.mesh.indices[i]]
		if int(round(g.mesh.colors[g.mesh.indices[i]].a * 16.0)) == 0:
			lo = lo.min(v)
			hi = hi.max(v)
	print("asphalt ", lo, hi, " origin ", g.origin)
	quit()
