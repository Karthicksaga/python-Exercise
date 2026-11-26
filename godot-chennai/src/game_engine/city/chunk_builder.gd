class_name ChunkBuilder
extends RefCounted
## Builds everything one chunk shows and blocks, on a worker thread (decision G-51): decodes the
## chunk file, places the street furniture and props, merges the meshes, makes the colliders,
## and assembles node trees that are **not** in the scene. The streamer adds them on the main
## thread a few at a time (`ChunkStreamer`), so the frame only pays for `add_child`.
##
## Layers (children of `view`, G-53): Ground (one surface: earth, parks, water, sand, verges,
## tarmac, paint, kerbs) and Trees (one `TreeBatch` of MultiMeshes) always; under `Near`, the walls, roofs,
## kit and objects (poles, shelters, props, AC units, dishes); under `Far`, one quad per wall
## and flat roofs. The streamer shows Near or Far by the chunk's distance from the focus
## (`ChunkStreamer.near_distance`): per-node visibility ranges hid chunks 160 m from the camera
## under the Compatibility renderer, so the switch is explicit and testable.
## Colliders: building walls as trimesh pieces of at most PIECE_BUILDINGS buildings, and one
## trimesh of closed boxes for trees, poles, shelters and props.

## Render layer of every merged chunk mesh (bit 2, value 2). Street lights leave it out of
## their cull mask (G-259): a merged chunk mesh spans 250 m, so on the Mobile renderer each lamp
## near it was evaluated for every pixel of the chunk's ground and walls.
const RENDER_LAYER := 2
const PIECE_BUILDINGS := 48
const AC_UNITS := 0.3
const DISHES := 0.2
const AC_ABOVE_FLOOR := 0.3


## What the streamer needs to build chunks: shared, read-only once set up.
class Kit:
	extends RefCounted
	var source: WorldSource
	var layouts: CityLayouts
	## What the chunks' roads do to vehicles (G-450): each build reports its open-country flag and
	## puddles. Null: nobody asks.
	var surface: RoadSurface
	var models: CityModels
	var materials: CityMaterials
	## The tree kit (G-381): eighteen species with three LODs each on the one atlas material.
	## Null draws no trees (tools that do not need them).
	var trees: TreeKit
	## The railway's index once it is built (G-383): plants keep clear of tracks. Null until then
	## (`CityWorld.set_rail_index` also removes what was planted too near in chunks already built).
	var rail_index: RailIndex
	## Where the camera is (world metres) when a build starts: the plants sort to a LOD for it
	## on the worker, so adding the chunk costs the main thread no sorting.
	var focus: Vector2 = Vector2.ZERO
	## Draw-call caps (the preset's): distinct tree species and distinct understory species a chunk.
	var tree_species: int = TreePlan.MAX_TREE_SPECIES
	var under_species: int = TreePlan.MAX_UNDER_SPECIES
	## Road detail (G-310 to G-313): off for a before and after comparison in tests and tools.
	var road_detail: bool = true
	## Quality of the optional road detail (G-317), the preset's number (`QualitySettings.LOW` 0,
	## `MEDIUM` 1, `HIGH` 2): Low drops tree guards, median shrubs, wires and rubble; Medium drops
	## guards, shrubs and rubble but keeps wires; High everything. Markings, kerbs, footpaths, the
	## ground tiles and the lamps are kept at every level.
	var road_extras: int = 2
	## The sea's outline (world metres), cut to each chunk it covers and drawn as ground water;
	## its bounding box for a quick reject. Empty when the map has no coast.
	var sea := PackedVector2Array()
	var sea_box := Rect2()
	## Landmark specs: OSM buildings whose centroid lies in a landmark footprint are left out
	## (the landmark's model stands there; world-format.md, G-185).
	var landmarks: Array[LandmarkSpec] = []
	## Distance (m, from the camera to a layer's centre) where the near look ends.
	var shadows: bool = true
	## Format 2.2 (G-190): area palettes (colours, roof types, storeys where OSM maps none) and
	## the sign categories. Null palettes mean today's generic Chennai palette.
	var palettes: AreaPalettes
	var signs: SignCategories
	## Optional Blender 100-building pack (`BuildingPack`): replaces eligible non-protected OSM
	## buildings with sculpted GLB instances (`LOD0` MultiMesh in `Near`, `LOD2` merged in `Far`).
	var building_pack: BuildingPack


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
	## Mapped vs estimated counts and object counts of this chunk (G-190, G-191): wall_mapped,
	## roof_estimated, sign_mapped, object:bench, zone:pitch, …
	var detail: Dictionary[String, int] = {}
	var surfaces: int = 0
	## Lamp heads for the night glow (G-316): (x, height, z) in world metres and a tint each.
	var lamp_points: PackedVector3Array = PackedVector3Array()
	var lamp_tints: PackedColorArray = PackedColorArray()
	## The road detail planned for this chunk (null when switched off).
	var roads: RoadDetail.Plan
	## The chunk's trees, bushes and grass (G-384); null when there are none.
	var tree_batch: TreeBatch
	## Static roadside poles and solid tree trunks in world XZ + radius (for pedestrian avoidance).
	var street_obstacles: PackedVector3Array = PackedVector3Array()
	var usec: int = 0
	var error: String = ""

	func total_triangles(near: bool = true) -> int:
		var n := 0
		for k in triangles:
			if k == "collider" or (near and (k == "far" or k == "pack_far")):
				continue
			if not near and k in ["walls", "roofs", "kit", "objects"]:
				continue
			n += triangles[k]
		return n


static func centre_of(source: WorldSource, cell: Vector2i) -> Vector2:
	return source.get_grid_origin() + (Vector2(cell) + Vector2(0.5, 0.5)) * source.get_chunk_size()


## The buildings that no landmark replaces: one whose vertex average lies in a landmark's
## exclude footprint is left out (as the world builder does, `world-format.md`).
static func without_landmark_buildings(buildings: Array[Building], landmarks: Array[LandmarkSpec]) -> Array[Building]:
	var kept: Array[Building] = []
	for b in buildings:
		var mid := Vector2.ZERO
		for p in b.outline:
			mid += p
		mid /= maxf(1.0, float(b.outline.size()))
		var hidden := false
		for spec in landmarks:
			if spec.excludes(mid):
				hidden = true
				break
		if not hidden:
			kept.append(b)
	return kept


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
	# Buildings other datasets add where OSM has none (G-221): the same building path below.
	kit.source.apply_fusion(chunk)
	if not kit.landmarks.is_empty():
		chunk.buildings = without_landmark_buildings(chunk.buildings, kit.landmarks)
	var layout := kit.layouts.layout_for(cell)
	var spans := layout.spans_in(cell)
	var size := layout.chunk_size
	var square := Rect2(kit.source.get_grid_origin() + Vector2(cell) * size, Vector2(size, size))
	var detail := kit.source.detail_for(cell)
	apply_detail(chunk, cell, detail, kit.palettes, kit.signs if kit.signs != null else SignCategories.shared())
	out.furniture = StreetFurniture.for_chunk(layout, chunk, cell)
	var near_objects := _objects_near(kit.source, cell)
	use_mapped_lamps(out.furniture, near_objects, layout, square)
	add_platform_shelters(out.furniture, near_objects, layout, chunk, square)
	out.props = StreetProps.for_chunk(layout, chunk, cell, out.furniture)
	if kit.road_detail:
		out.roads = RoadDetail.for_chunk(layout, chunk, cell, square, out.furniture, kit.road_extras)
		if kit.surface != null:
			kit.surface.note_chunk(cell, out.roads.rural, out.roads.decals)
		if out.roads.rural:
			# Open country has no kerbs along the road: a dust shoulder instead (G-314).
			out.furniture.kerbs.clear()
			for pole in out.furniture.poles:
				pole.kind = &"rural"

	var view := Node3D.new()
	view.name = "Chunk_%d_%d" % [cell.x, cell.y]
	out.view = view

	var water := WaterMeshes.new()
	water.origin = out.centre
	water.polygons = WaterMeshes.gather(chunk.areas, layout.water_in(cell), square)
	var ground := GroundMeshes.new()
	ground.origin = out.centre
	ground.build(spans, chunk.areas, square, out.furniture.kerbs, water.polygons, out.furniture.medians, out.roads)
	# Zebra crossings and speed breakers (G-153), on the road at its height.
	var bump_faces := PackedVector3Array()
	for sp: WorldSpot in layout.spots_in(cell):
		if sp.is_zebra():
			ground.zebra(sp, 0.0)
		elif sp.is_bump():
			bump_faces.append_array(ground.bump(RoadBumps.from_spot(sp), 0.0))
	if not kit.sea.is_empty() and kit.sea_box.intersects(square):
		ground.sea(kit.sea, square)
	var near := Node3D.new()
	near.name = "Near"
	view.add_child(near)
	var far := Node3D.new()
	far.name = "Far"
	far.visible = false
	view.add_child(far)
	# Bridges, flyovers, ramps and covered roads (G-151): always drawn (seen from afar).
	var decks := DeckMeshes.new()
	decks.origin = out.centre
	decks.layout = layout
	for span: CityLayout.RoadSpan in spans:
		decks.add_span(span)
	water.build(square, decks, layout)
	# Mapped zones (pitches, courts, tracks, pools, platforms) and barriers (G-191).
	var objects := MeshBuilder.new()
	var dm := DetailMeshes.new()
	dm.origin = out.centre
	dm.square = square
	dm.layout = layout
	dm.models = kit.models
	dm.objects = objects
	dm.ground = ground
	dm.water = water
	dm.buildings = chunk.buildings
	dm.boxes = StreetFurniture.building_boxes(chunk.buildings)
	var line_trees: Array[WorldTree] = []
	if detail != null:
		var lines := _lines_near(kit.source, cell, size)
		line_trees = dm.add_lines(lines, water.polygons)
		dm.add_zones(detail.zones_in(cell), kit.models, water.polygons)
	_add_mesh(out, view, "ground", ground.mesh, kit.materials.ground, false)
	_add_mesh(out, view, "water", water.mesh, kit.materials.water, false)
	_add_mesh(out, view, "decks", decks.mesh, kit.materials.decks, kit.shadows)
	if not bump_faces.is_empty():
		decks.solid_faces(bump_faces)
	for piece in decks.faces:
		if not piece.is_empty():
			_body(out, "Decks", piece)

	var meshes := BuildingMeshes.new()
	meshes.origin = out.centre
	meshes.table = kit.signs if kit.signs != null else SignCategories.shared()
	meshes.signs = _signs_near(kit.source, cell)
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	var pack_near: Dictionary[int, Array] = {}
	var pack_far := MeshBuilder.new()
	var pack_rects: Array[Rect2] = []
	var pack_polys: Array[PackedVector2Array] = []
	for bi in chunk.buildings.size():
		var b := chunk.buildings[bi]
		var lookup_id := b.source_id if b.source_id > 0 else b.id
		var aidx := kit.building_pack.asset_index_for(lookup_id) if kit.building_pack != null and b.min_height <= 0.0 and b.outline.size() >= 3 else -1
		if aidx >= 0 and kit.building_pack.lod0_meshes[aidx] != null:
			var mesh_aabb: AABB = kit.building_pack.lod0_meshes[aidx].get_aabb()
			var fit := BuildingPack.checked_placement(b, spans, kit.building_pack.asset_dims[aidx], mesh_aabb, out.centre, boxes, chunk.buildings, bi, pack_rects, pack_polys)
			if bool(fit.get("ok", false)):
				var xform := fit["xform"] as Transform3D
				if not pack_near.has(aidx):
					pack_near[aidx] = []
				(pack_near[aidx] as Array).append(xform)
				if kit.building_pack.lod2_builders[aidx] != null:
					pack_far.append(kit.building_pack.lod2_builders[aidx], xform)
				pack_rects.append(fit["rect"] as Rect2)
				pack_polys.append(fit["fp"] as PackedVector2Array)
				out.detail["pack100_replaced"] = out.detail.get("pack100_replaced", 0) + 1
				continue
			out.detail["pack100_fallback"] = out.detail.get("pack100_fallback", 0) + 1
		var plan := BuildingMeshes.plan_facade(b, spans)
		meshes.palette = kit.palettes.at(BuildingMeshes.centre_of(b)) if kit.palettes != null else null
		meshes.add(b, plan)
		if b.min_height <= 0.0:
			_fixtures(kit.models, objects, b, plan, chunk.buildings, boxes, out.centre)
	_add_mesh(out, near, "walls", meshes.walls, kit.materials.walls, kit.shadows)
	_add_mesh(out, near, "roofs", meshes.roofs, kit.materials.roofs, kit.shadows)
	_add_mesh(out, near, "kit", meshes.kit, kit.materials.kit, false)
	_add_mesh(out, far, "far", meshes.far, kit.materials.objects, kit.shadows)
	_add_pack_buildings(kit, out, near, far, pack_near, pack_far)

	for pole in out.furniture.poles:
		CityModels.place(objects, kit.models.pole_of(pole.kind), _local3(pole.position, out.centre), pole.yaw)
	for s in out.furniture.shelters:
		CityModels.place(objects, kit.models.shelter, _local3(s.position, out.centre), s.yaw)
	for p in out.props:
		var model: MeshBuilder = kit.models.props.get(p.kind)
		if model != null:
			CityModels.place(objects, model, _local3(p.position, out.centre), p.yaw)
	if out.roads != null:
		var all_poles: Array[StreetFurniture.Pole] = []
		all_poles.append_array(out.furniture.poles)
		for pole in out.roads.poles:
			CityModels.place(objects, kit.models.pole_of(pole.kind), _local3(pole.position, out.centre), pole.yaw)
			if pole.kind == &"arm" or pole.kind == &"rural":
				all_poles.append(pole)
		if kit.road_extras >= 1:
			out.detail["wires"] = RoadObjects.wires(objects, all_poles, out.centre)
		if kit.road_extras >= 2:
			out.detail["median_shrubs"] = RoadObjects.shrubs(objects, kit.models, out.furniture.medians, out.centre)
		out.detail["crossings"] = out.roads.crossings.size()
		for post in out.roads.chevrons:
			CityModels.place(objects, kit.models.chevron, _local3(post.position, out.centre), post.yaw)
		for post in out.roads.stones:
			CityModels.place(objects, kit.models.stone, _local3(post.position, out.centre), post.yaw)
		out.detail["barrier_segments"] = RoadObjects.barriers(objects, out.roads.barriers, out.centre)
		out.detail["chevrons"] = out.roads.chevrons.size()
	if detail != null:
		dm.add_objects(detail.objects_in(cell), water.polygons)
		for s in out.furniture.shelters:
			var across := Vector2(cos(s.yaw), -sin(s.yaw))
			CityModels.place(objects, kit.models.detail.models[&"stop_pole"], _local3(s.position + across * (StreetFurniture.SHELTER_WIDTH / 2.0 + 0.7), out.centre), s.yaw)
			dm.stats["stop_pole"] = dm.stats.get("stop_pole", 0) + 1
	_collect_lamps(out)
	var all_trees: Array[WorldTree] = chunk.trees.duplicate()
	all_trees.append_array(line_trees)
	if out.roads != null:
		all_trees.append_array(out.roads.trees)
	var trees := standing_trees(all_trees, water.polygons, layout)
	if out.roads != null and kit.road_extras >= 2:
		var caged := RoadDetail.guarded(layout, trees)
		RoadObjects.guards(objects, kit.models, caged, out.centre)
		out.detail["tree_guards"] = caged.size()
	_add_mesh(out, near, "objects", objects, kit.materials.objects, kit.shadows)
	for k in meshes.stats:
		out.detail[k] = meshes.stats[k]
	for k in dm.stats:
		out.detail[k] = dm.stats[k]

	var plan := TreePlan.Context.new()
	plan.layout = layout
	plan.buildings = chunk.buildings
	plan.boxes = boxes
	plan.areas = chunk.areas
	plan.water = water.polygons
	plan.palettes = kit.palettes
	plan.rail = kit.rail_index
	plan.square = square
	plan.max_species = kit.tree_species
	plan.max_under = kit.under_species
	plan.rural = out.roads.rural if out.roads != null else chunk.buildings.size() < RoadDetail.RURAL_BUILDINGS
	var spots := TreePlan.for_chunk(plan, trees)
	_add_trees(kit, out, spots)
	_add_colliders(out, chunk, spots)
	if not dm.solids.is_empty():
		_body(out, "DetailSolids", dm.solids)
	if not dm.slab_faces.is_empty():
		_body(out, "Platforms", dm.slab_faces)
	out.usec = Time.get_ticks_usec() - started
	return out


## Lamp heads of every pole of the chunk (G-316), for the night glow.
static func _collect_lamps(out: Build) -> void:
	var poles: Array[StreetFurniture.Pole] = []
	poles.append_array(out.furniture.poles)
	if out.roads != null:
		poles.append_array(out.roads.poles)
	for pole in poles:
		var heads := RoadLamps.heads(pole)
		for h in heads:
			out.lamp_points.append(h)
			out.lamp_tints.append(RoadLamps.tint_of(pole))


static func _local3(p: Vector2, centre: Vector2, y: float = 0.0) -> Vector3:
	return Vector3(p.x - centre.x, y, p.y - centre.y)


static func _add_mesh(out: Build, parent: Node3D, layer: String, builder: MeshBuilder, material: Material, shadows: bool) -> void:
	var mesh := builder.commit(material)
	if mesh == null:
		return
	var mi := MeshInstance3D.new()
	mi.name = layer.capitalize()
	mi.mesh = mesh
	mi.layers = RENDER_LAYER
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(mi)
	out.triangles[layer] = builder.triangle_count()
	out.surfaces += 1


static func _add_pack_buildings(kit: Kit, out: Build, near: Node3D, far: Node3D, pack_near: Dictionary[int, Array], pack_far: MeshBuilder) -> void:
	if kit.building_pack == null or pack_near.is_empty():
		return
	var holder := BuildingPack.Batch.build(kit.building_pack, pack_near, out.centre, kit.focus, kit.materials.landmark, kit.shadows, RENDER_LAYER)
	near.add_child(holder)
	out.surfaces += holder.draw_calls()

	var far_mesh := pack_far.commit(kit.materials.landmark)
	if far_mesh != null:
		var far_mi := MeshInstance3D.new()
		far_mi.name = "PackFar"
		far_mi.mesh = far_mesh
		far_mi.layers = RENDER_LAYER
		far_mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		far.add_child(far_mi)
		out.triangles["pack_far"] = pack_far.triangle_count()


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


## Trees that can stand where they are (G-151, G-152): not in the water and not through a deck
## (avenue trees were planted along roads that turn out to be flyovers and bridges).
static func standing_trees(all: Array[WorldTree], water: Array[PackedVector2Array], layout: CityLayout) -> Array[WorldTree]:
	var out: Array[WorldTree] = []
	for t in all:
		if not water.is_empty() and WaterMeshes.inside_any(t.position, water, -1):
			continue
		var blocked := [false]
		layout.segments_near(t.position, 20.0, func(ri: int, i: int) -> bool:
			var road := layout.roads[ri]
			if not road.is_raised():
				return false
			var a := road.points[i]
			var ab := road.points[i + 1] - a
			var len2 := ab.length_squared()
			var u := 0.0 if len2 < 1e-9 else clampf((t.position - a).dot(ab) / len2, 0.0, 1.0)
			var reach := road.width / 2.0 + 2.5
			if (a + ab * u).distance_squared_to(t.position) < reach * reach and road.height_at(i, u) > 1.0:
				blocked[0] = true
			return blocked[0])
		if not blocked[0]:
			out.append(t)
	return out


## The chunk's plants as one `TreeBatch` (G-384): per species three MultiMeshes, sorted to a LOD by
## distance. `triangles["trees"]` and `["palms"]` are the LOD 0 triangles of the chunk's trees and
## palms (the budget of the nearest ring); `detail["tree_species"]` and `["tree_instances"]` count.
static func _add_trees(kit: Kit, out: Build, spots: Array[TreeSpot]) -> void:
	if kit.trees == null or spots.is_empty():
		return
	var batch := TreeBatch.build(kit.trees, spots, out.centre, kit.focus)
	out.view.add_child(batch)
	out.tree_batch = batch
	var trees_tris := 0
	var palm_tris := 0
	for g in batch.groups:
		var tris: PackedInt32Array = kit.trees.triangles[g.species]
		if TreeSpecies.kind_of(g.species) == TreeSpecies.PALM:
			palm_tris += tris[0] * g.count
		else:
			trees_tris += tris[0] * g.count
	out.triangles["trees"] = trees_tris
	out.triangles["palms"] = palm_tris
	out.detail["tree_species"] = batch.groups.size()
	out.detail["tree_instances"] = spots.size()


## Building walls (from 1 m below ground, so nothing slips under) as trimesh pieces, and closed
## boxes for trees, poles, shelters and props (`chunkSolids`, `furnitureSolids`, `propSolids`).
static func _add_colliders(out: Build, chunk: ChunkData, trees: Array[TreeSpot]) -> void:
	var faces := PackedVector3Array()
	var count := 0
	for b in chunk.buildings:
		var o := b.outline
		for i in o.size():
			var a := o[i] - out.centre
			var c := o[(i + 1) % o.size()] - out.centre
			var low := -1.0 if b.min_height <= 0.0 else b.min_height
			var a0 := Vector3(a.x, low, a.y)
			var c0 := Vector3(c.x, low, c.y)
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
	var tree_faces := PackedVector3Array()
	for t in trees:
		if not TreeSpecies.solid(t.species):
			continue
		var r := maxf(0.22, TreeSpecies.number(t.species, "trunk") * t.scale * 0.9)
		solid_box(tree_faces, Vector3(t.position.x - out.centre.x, 2.75, t.position.y - out.centre.y), Vector3(r, 2.75, r), 0.0)
		out.street_obstacles.append(Vector3(t.position.x, t.position.y, r + 0.15))
	if not tree_faces.is_empty():
		_body(out, "Trees", tree_faces)
	var all_poles: Array[StreetFurniture.Pole] = out.furniture.poles.duplicate()
	if out.roads != null:
		all_poles.append_array(out.roads.poles)
	for p in all_poles:
		var pr := StreetFurniture.POLE_HALF + 0.12
		out.street_obstacles.append(Vector3(p.position.x, p.position.y, pr))
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


## Most triangles in one collider body (G-257): Jolt builds a mesh shape when its body enters the
## world, on the main thread, and one chunk's boxes for trees, poles and props (or its barriers)
## in a single trimesh took up to 33 ms to add. A multiple of 12 (a box) and of 2 (a wall quad).
const MAX_BODY_TRIANGLES := 1200


static func _body(out: Build, label: String, faces: PackedVector3Array) -> void:
	var limit := MAX_BODY_TRIANGLES * 3
	if faces.size() > limit:
		for start in range(0, faces.size(), limit):
			_body(out, label, faces.slice(start, mini(start + limit, faces.size())))
		return
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(faces)
	var body := StaticBody3D.new()
	body.name = "%s%d" % [label, out.bodies.size()]
	if label == "Trees":
		body.add_to_group(&"tree_collider")
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	out.bodies.append(body)
	out.triangles["collider"] = out.triangles.get("collider", 0) + faces.size() / 3



## Fills the buildings of a chunk with what `detail.bin` maps (G-190): wall and roof colours,
## materials, the sign category; hides a building that is only the outline of its parts and adds
## the parts (`building:part`, drawn from their `min_height` up). Where the area palette has
## storey weights, houses whose height OSM does not map take them (estimated).
static func apply_detail(chunk: ChunkData, cell: Vector2i, detail: DetailTile, palettes: AreaPalettes, table: SignCategories) -> void:
	var kept: Array[Building] = []
	for b in chunk.buildings:
		var palette: AreaPalettes.Palette = palettes.at(BuildingMeshes.centre_of(b)) if palettes != null else null
		if palette != null and palette.id != "default" and palette.has_storeys() and b.kind == &"house" and b.height_from == &"estimated":
			b.floors = palette.pick_storeys(CityHash.unit(b.id, 71))
			b.height = b.floors * BuildingMeshes.FLOOR_HEIGHT + BuildingMeshes.PARAPET
		if detail != null:
			var info: DetailTile.BuildingInfo = detail.buildings.get(b.id)
			if info != null:
				if info.is_parts_host():
					continue
				if info.has_wall_colour():
					b.color_hex = info.wall
					b.wall_mapped = true
				if info.has_roof_colour():
					b.detail_roof = info.roof
				b.detail_material = info.material
				b.detail_roof_material = info.roof_material
				b.detail_category = info.category
				b.detail_shop = info.category > 0 and (table == null or not table.is_public(info.category))
		kept.append(b)
	if detail != null:
		for part in detail.parts_in(cell):
			var area: AreaPalettes.Palette = palettes.at(BuildingMeshes.centre_of(part)) if palettes != null else null
			if not part.wall_mapped and area != null and area.id != "default" and not area.walls.is_empty():
				part.color_hex = area.walls[floori(CityHash.unit(part.id, 7) * area.walls.size())]
			kept.append(part)
	chunk.buildings = kept


## Mapped objects (street lamps, bus platforms) of a cell and its eight neighbours.
static func _objects_near(source: WorldSource, cell: Vector2i) -> Array[DetailTile.ObjectSpot]:
	var out: Array[DetailTile.ObjectSpot] = []
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var c := cell + Vector2i(dx, dz)
			var t := source.detail_for(c)
			if t != null:
				for o in t.objects_in(c):
					if o.kind == &"street_lamp" or o.kind == &"bus_platform":
						out.append(o)
	return out


static func _signs_near(source: WorldSource, cell: Vector2i) -> Array[DetailTile.SignSpot]:
	var out: Array[DetailTile.SignSpot] = []
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var c := cell + Vector2i(dx, dz)
			var t := source.detail_for(c)
			if t != null:
				out.append_array(t.signs_in(c))
	return out


## Barrier and platform lines touching a cell.
static func _lines_near(source: WorldSource, cell: Vector2i, _size: float) -> Array[DetailTile.LineFeature]:
	var t := source.detail_for(cell)
	return t.lines_in(cell) if t != null else ([] as Array[DetailTile.LineFeature])


## Mapped street lamps replace the generated poles within LAMP_CLEAR of them (G-191).
const LAMP_CLEAR := 14.0

static func use_mapped_lamps(furniture: StreetFurniture.Result, objects: Array[DetailTile.ObjectSpot], layout: CityLayout, square: Rect2) -> void:
	var lamps: Array[Vector2] = []
	for o in objects:
		if o.kind == &"street_lamp":
			lamps.append(o.position)
	if lamps.is_empty():
		return
	var kept: Array[StreetFurniture.Pole] = []
	for pole in furniture.poles:
		var near := false
		for l in lamps:
			near = near or l.distance_to(pole.position) < LAMP_CLEAR
		if not near:
			kept.append(pole)
	for l in lamps:
		if not square.has_point(l):
			continue
		var hit := layout.nearest_road_point(l, false)
		if hit.is_empty() or float(hit["distance"]) > 30.0:
			continue
		var road: Road = layout.roads[int(hit["road_index"])]
		if road.is_raised():
			continue
		var pole := StreetFurniture.Pole.new()
		pole.position = l
		pole.yaw = StreetFurniture.facing((hit["point"] as Vector2) - l)
		pole.road_id = road.id
		kept.append(pole)
	furniture.poles = kept


## A shelter at a mapped bus platform (`public_transport=platform`) that has none within 20 m.
static func add_platform_shelters(furniture: StreetFurniture.Result, objects: Array[DetailTile.ObjectSpot], layout: CityLayout, chunk: ChunkData, square: Rect2) -> void:
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	for o in objects:
		if o.kind != &"bus_platform" or not square.has_point(o.position):
			continue
		var covered := false
		for s in furniture.shelters:
			covered = covered or s.position.distance_to(o.position) < 20.0
		if covered:
			continue
		var place := Place.new()
		place.position = o.position
		place.kind = &"bus_stop"
		var shelter := StreetFurniture.place_shelter(layout, place)
		if shelter != null and not StreetFurniture.in_building(chunk.buildings, boxes, shelter.position, 0.5):
			furniture.shelters.append(shelter)
