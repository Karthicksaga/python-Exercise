class_name ChunkBuilder
extends RefCounted
## Builds everything one chunk shows and blocks, on a worker thread (decision G-51): decodes the
## chunk file, places the street furniture and props, merges the meshes, makes the colliders,
## and assembles node trees that are **not** in the scene. The streamer adds them on the main
## thread a few at a time (`ChunkStreamer`), so the frame only pays for `add_child`.
##
## Layers (children of `view`, G-53): Ground (one surface: earth, parks, water, sand, verges,
## tarmac, paint, kerbs) and Trees/Palms (MultiMesh) always; under `Near`, the walls, roofs,
## kit and objects (poles, shelters, props, AC units, dishes); under `Far`, one quad per wall
## and flat roofs. The streamer shows Near or Far by the chunk's distance from the focus
## (`ChunkStreamer.near_distance`): per-node visibility ranges hid chunks 160 m from the camera
## under the Compatibility renderer, so the switch is explicit and testable.
## Colliders: building walls as trimesh pieces of at most PIECE_BUILDINGS buildings, and one
## trimesh of closed boxes for trees, poles, shelters and props.

const PALMS := 0.4
const PIECE_BUILDINGS := 48
const AC_UNITS := 0.3
const DISHES := 0.2
const AC_ABOVE_FLOOR := 0.3


## What the streamer needs to build chunks: shared, read-only once set up.
class Kit:
	extends RefCounted
	var source: WorldSource
	var layouts: CityLayouts
	var models: CityModels
	var materials: CityMaterials
	var tree_mesh: ArrayMesh
	var palm_mesh: ArrayMesh
	## Triangles of one tree and one palm (never ask the meshes on a worker: that waits on the
	## render thread).
	var tree_triangles: int = 0
	var palm_triangles: int = 0
	## The sea's outline (world metres), cut to each chunk it covers and drawn as ground water;
	## its bounding box for a quick reject. Empty when the map has no coast.
	var sea := PackedVector2Array()
	var sea_box := Rect2()
	## Distance (m, from the camera to a layer's centre) where the near look ends.
	var shadows: bool = true


## A finished build, ready to add.
class Build:
	extends RefCounted
	var cell: Vector2i
	var chunk: ChunkData
	## World metres of the chunk's centre: the local origin of every mesh and collider.
	var centre: Vector2
	var view: Node3D
	## Collider bodies, each a child-to-be of the chunk's physics root.
	var bodies: Array[StaticBody3D] = []
	var furniture: StreetFurniture.Result
	var props: Array[StreetProps.Prop] = []
	## Triangles per layer, surfaces (draw calls without shadows), build time.
	var triangles: Dictionary[String, int] = {}
	var surfaces: int = 0
	var usec: int = 0
	var error: String = ""

	func total_triangles(near: bool = true) -> int:
		var n := 0
		for k in triangles:
			if k == "collider" or (near and k == "far"):
				continue
			if not near and k in ["walls", "roofs", "kit", "objects"]:
				continue
			n += triangles[k]
		return n


static func centre_of(source: WorldSource, cell: Vector2i) -> Vector2:
	return source.get_grid_origin() + (Vector2(cell) + Vector2(0.5, 0.5)) * source.get_chunk_size()


static func build(kit: Kit, cell: Vector2i) -> Build:
	var started := Time.get_ticks_usec()
	var out := Build.new()
	out.cell = cell
	out.centre = centre_of(kit.source, cell)
	var chunk := kit.source.read_chunk(cell)
	out.chunk = chunk
	if not chunk.ok():
		out.error = chunk.error
		return out
	var layout := kit.layouts.layout_for(cell)
	var spans := layout.spans_in(cell)
	var size := layout.chunk_size
	var square := Rect2(kit.source.get_grid_origin() + Vector2(cell) * size, Vector2(size, size))
	out.furniture = StreetFurniture.for_chunk(layout, chunk, cell)
	out.props = StreetProps.for_chunk(layout, chunk, cell, out.furniture)

	var view := Node3D.new()
	view.name = "Chunk_%d_%d" % [cell.x, cell.y]
	out.view = view

	var ground := GroundMeshes.new()
	ground.origin = out.centre
	ground.build(spans, chunk.areas, square, out.furniture.kerbs)
	if not kit.sea.is_empty() and kit.sea_box.intersects(square):
		ground.sea(kit.sea, square)
	var near := Node3D.new()
	near.name = "Near"
	view.add_child(near)
	var far := Node3D.new()
	far.name = "Far"
	far.visible = false
	view.add_child(far)
	_add_mesh(out, view, "ground", ground.mesh, kit.materials.ground, false)
	# Bridges, flyovers, ramps and covered roads (G-151): always drawn (seen from afar).
	var decks := DeckMeshes.new()
	decks.origin = out.centre
	decks.layout = layout
	for span: CityLayout.RoadSpan in spans:
		decks.add_span(span)
	_add_mesh(out, view, "decks", decks.mesh, kit.materials.decks, kit.shadows)
	for piece in decks.faces:
		if not piece.is_empty():
			_body(out, "Decks", piece)

	var meshes := BuildingMeshes.new()
	meshes.origin = out.centre
	var objects := MeshBuilder.new()
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	for b in chunk.buildings:
		var plan := BuildingMeshes.plan_facade(b, spans)
		meshes.add(b, plan)
		_fixtures(kit.models, objects, b, plan, chunk.buildings, boxes, out.centre)
	_add_mesh(out, near, "walls", meshes.walls, kit.materials.walls, kit.shadows)
	_add_mesh(out, near, "roofs", meshes.roofs, kit.materials.roofs, kit.shadows)
	_add_mesh(out, near, "kit", meshes.kit, kit.materials.kit, false)
	_add_mesh(out, far, "far", meshes.far, kit.materials.objects, kit.shadows)

	for pole in out.furniture.poles:
		CityModels.place(objects, kit.models.pole, _local3(pole.position, out.centre), pole.yaw)
	for s in out.furniture.shelters:
		CityModels.place(objects, kit.models.shelter, _local3(s.position, out.centre), s.yaw)
	for p in out.props:
		var model: MeshBuilder = kit.models.props.get(p.kind)
		if model != null:
			CityModels.place(objects, model, _local3(p.position, out.centre), p.yaw)
	_add_mesh(out, near, "objects", objects, kit.materials.objects, kit.shadows)

	_add_trees(kit, out, chunk)
	_add_colliders(out, chunk)
	out.usec = Time.get_ticks_usec() - started
	return out


static func _local3(p: Vector2, centre: Vector2, y: float = 0.0) -> Vector3:
	return Vector3(p.x - centre.x, y, p.y - centre.y)


static func _add_mesh(out: Build, parent: Node3D, layer: String, builder: MeshBuilder, material: Material, shadows: bool) -> void:
	var mesh := builder.commit(material)
	if mesh == null:
		return
	var mi := MeshInstance3D.new()
	mi.name = layer.capitalize()
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	out.triangles[layer] = builder.triangle_count()
	out.surfaces += 1


## Wall AC units and rooftop dishes (`buildingFixtures`), invented: AC units only on buildings
## without balconies, between the two middle bays of walls without shops; dishes on flat roofs
## near a corner, all pointing the same way.
static func _fixtures(models: CityModels, into: MeshBuilder, b: Building, plan: BuildingMeshes.Plan, buildings: Array[Building], boxes: Array[Rect2], centre: Vector2) -> void:
	var outline := b.outline
	var frame := BuildingMeshes.frame_of(b)
	var upper_floors := b.floors - 1
	var ac: MeshBuilder = models.props.get(&"ac_unit")
	var dish: MeshBuilder = models.props.get(&"dish")
	if ac != null and not ac.is_empty() and upper_floors > 0 and not plan.balconies and CityHash.unit(b.id, 301) < AC_UNITS:
		var storey := (float(frame["upper_top"]) - float(frame["ground_floor"])) / upper_floors
		for i in outline.size():
			if plan.shop_walls.has(i):
				continue
			var p := outline[i]
			var q := outline[(i + 1) % outline.size()]
			var length := p.distance_to(q)
			var bays := maxi(1, roundi(length / float(frame["bay"])))
			if bays < 2 or length / bays < 1.6:
				continue
			if CityHash.unit(b.id, 310 + i) >= 0.3:
				continue
			var s := float(bays / 2) / bays * length
			var floor_i := floori(CityHash.unit(b.id, 330 + i) * upper_floors)
			var u := (q - p) / length
			var n := Vector2(u.y, -u.x)
			if StreetFurniture.in_building(buildings, boxes, p + u * s + n * 0.6, 0.0):
				continue
			var at := p + u * s + n * 0.02
			CityModels.place(into, ac, _local3(at, centre, float(frame["ground_floor"]) + floor_i * storey + AC_ABOVE_FLOOR), atan2(n.x, n.y))
	if dish != null and not dish.is_empty() and not frame["tiled"] and outline.size() >= 3 and CityHash.unit(b.id, 302) < DISHES:
		var c := Vector2.ZERO
		for p in outline:
			c += p
		c /= outline.size()
		var corner := outline[floori(CityHash.unit(b.id, 303) * outline.size())]
		var d := corner.distance_to(c)
		if d > 3.5:
			var at := corner + (c - corner) * (1.3 / d)
			if StreetFurniture.point_in_polygon(at, outline):
				CityModels.place(into, dish, _local3(at, centre, float(frame["roof_y"])), (CityHash.unit(b.id, 304) - 0.5) * 0.4)


static func _add_trees(kit: Kit, out: Build, chunk: ChunkData) -> void:
	var palms: Array[WorldTree] = []
	var trees: Array[WorldTree] = []
	for t in chunk.trees:
		if CityHash.tree_unit(t.position, 51) < PALMS:
			palms.append(t)
		else:
			trees.append(t)
	for kind in 2:
		var list := palms if kind == 0 else trees
		if list.is_empty():
			continue
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = kit.palm_mesh if kind == 0 else kit.tree_mesh
		mm.instance_count = list.size()
		for i in list.size():
			var t := list[i]
			var angle: float
			var size: float
			var tint: Color
			if kind == 0:
				angle = CityHash.tree_unit(t.position, 52) * TAU
				size = t.scale * (0.85 + CityHash.tree_unit(t.position, 53) * 0.35)
				var v := 0.85 + CityHash.tree_unit(t.position, 54) * 0.3
				tint = Color(v, v, v * 0.92)
			else:
				angle = fmod(t.position.x * 13.7 + t.position.y * 7.3, 6.28)
				size = t.scale
				var v := 0.85 + fposmod(t.position.x * 3.1 + t.position.y * 5.7, 1.0) * 0.3
				tint = Color(v, v, v * 0.9)
			mm.set_instance_transform(i, Transform3D(Basis(Vector3.UP, angle).scaled(Vector3(size, size, size)), _local3(t.position, out.centre)))
			mm.set_instance_color(i, tint)
		var node := MultiMeshInstance3D.new()
		node.name = "Palms" if kind == 0 else "Trees"
		node.multimesh = mm
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if kit.shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		out.view.add_child(node)
		var per := kit.palm_triangles if kind == 0 else kit.tree_triangles
		out.triangles["palms" if kind == 0 else "trees"] = per * list.size()
		out.surfaces += 1


## Building walls (from 1 m below ground, so nothing slips under) as trimesh pieces, and closed
## boxes for trees, poles, shelters and props (`chunkSolids`, `furnitureSolids`, `propSolids`).
static func _add_colliders(out: Build, chunk: ChunkData) -> void:
	var faces := PackedVector3Array()
	var count := 0
	for b in chunk.buildings:
		var o := b.outline
		for i in o.size():
			var a := o[i] - out.centre
			var c := o[(i + 1) % o.size()] - out.centre
			var a0 := Vector3(a.x, -1.0, a.y)
			var c0 := Vector3(c.x, -1.0, c.y)
			var a1 := Vector3(a.x, b.height, a.y)
			var c1 := Vector3(c.x, b.height, c.y)
			faces.append_array([a0, c1, c0, a0, a1, c1])
		count += 1
		if count >= PIECE_BUILDINGS:
			_body(out, "Walls", faces)
			faces = PackedVector3Array()
			count = 0
	if not faces.is_empty():
		_body(out, "Walls", faces)
	var solids := PackedVector3Array()
	for t in chunk.trees:
		solid_box(solids, Vector3(t.position.x - out.centre.x, 1.5, t.position.y - out.centre.y), Vector3(0.28 * t.scale, 1.5, 0.28 * t.scale), 0.0)
	for p in out.furniture.poles:
		var h := StreetFurniture.POLE_HEIGHT / 2.0
		solid_box(solids, _local3(p.position, out.centre, h), Vector3(StreetFurniture.POLE_HALF + 0.02, h, StreetFurniture.POLE_HALF + 0.02), p.yaw)
	for s in out.furniture.shelters:
		var basis := Basis(Vector3.UP, s.yaw)
		var c := _local3(s.position, out.centre)
		solid_box(solids, c + basis * Vector3(0, 1.2, StreetFurniture.SHELTER_DEPTH / 2.0 - 0.08), Vector3(StreetFurniture.SHELTER_WIDTH / 2.0, 1.2, 0.08), s.yaw)
		for side: float in [-1.0, 1.0]:
			solid_box(solids, c + basis * Vector3(side * (StreetFurniture.SHELTER_WIDTH / 2.0 - 0.1), 1.25, -StreetFurniture.SHELTER_DEPTH / 2.0 + 0.1), Vector3(0.08, 1.25, 0.08), s.yaw)
	for p in out.props:
		var size: Vector3 = StreetProps.SIZE[p.kind]
		solid_box(solids, _local3(p.position, out.centre, size.z / 2.0), Vector3(size.x, size.z / 2.0, size.y), p.yaw)
	if not solids.is_empty():
		_body(out, "Solids", solids)


## A closed box as 12 triangles, half-sizes `half`, turned by yaw about +Y.
static func solid_box(faces: PackedVector3Array, centre: Vector3, half: Vector3, yaw: float) -> void:
	var basis := Basis(Vector3.UP, yaw)
	var c: Array[Vector3] = []
	for i in 8:
		var v := Vector3(half.x if i & 1 else -half.x, half.y if i & 2 else -half.y, half.z if i & 4 else -half.z)
		c.append(centre + basis * v)
	for q: Array in [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]:
		faces.append_array([c[q[0]], c[q[1]], c[q[2]], c[q[0]], c[q[2]], c[q[3]]])


static func _body(out: Build, label: String, faces: PackedVector3Array) -> void:
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(faces)
	var body := StaticBody3D.new()
	body.name = "%s%d" % [label, out.bodies.size()]
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	out.bodies.append(body)
	out.triangles["collider"] = out.triangles.get("collider", 0) + faces.size() / 3
