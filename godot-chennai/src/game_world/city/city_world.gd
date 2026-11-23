class_name CityWorld
extends Node3D
## The streamed city (phase 1, decisions G-50…G-59): the chunk streamer, the always-loaded
## landmarks and sea, the ground plane and the map's edge walls. It holds no gameplay.
##
## `setup(source)` prepares everything on worker threads (road layout, prop models, materials,
## landmark meshes, the sea), then streaming runs every frame round `focus_node` (or `focus`).
## Systems that must not run on unloaded ground (AI, combat, the player's first frame) wait on
## `world_ready_around(point)` / `await wait_ready_around(point)`.
##
## The scene carries a minimal sun, sky and haze and a preview camera so it can be looked at on
## its own; the environment and camera work replace them.

signal ready_to_stream

## Where streaming centres when no `focus_node` is set (world metres).
@export var focus: Vector2 = Vector2.ZERO
## Followed every frame when set (its scene position, converted to world metres).
@export var focus_node: Node3D
## Recentre the floating origin on `focus_node` when it wanders far (G-7).
@export var manage_origin: bool = false
## The Three.js game's spawn: the nearest road to this point (`content.ts`).
const SPAWN_NEAR := Vector2(40.0, 60.0)

var source: WorldSource
var layout: CityLayout
var models: CityModels
var materials: CityMaterials
var streamer: ChunkStreamer
## {"point": Vector2, "heading": float} on the road nearest SPAWN_NEAR.
var spawn: Dictionary = {}
var error: String = ""

var _ground: StaticBody3D
var _fixed: Node3D

@onready var camera: Camera3D = $Camera


func _ready() -> void:
	streamer = ChunkStreamer.new()
	streamer.name = "Chunks"
	add_child(streamer)
	_ground = StaticBody3D.new()
	_ground.name = "Ground"
	var cs := CollisionShape3D.new()
	cs.shape = WorldBoundaryShape3D.new()
	_ground.add_child(cs)
	add_child(_ground)
	_fixed = Node3D.new()
	_fixed.name = "Landmarks"
	add_child(_fixed)


## Prepares the city from an opened source; "" or what went wrong. Awaits worker threads.
func setup(world: WorldSource) -> String:
	source = world
	var index := world.index_at(world.get_bounds().get_center())
	var stops: Array[Place] = index.bus_stops if index != null else ([] as Array[Place])
	var roads := world.loaded_roads()
	var bounds := world.get_bounds()
	var size := world.get_chunk_size()
	layout = await BackgroundTask.start(func() -> CityLayout: return CityLayout.build(roads, bounds, size, stops)).finish(get_tree())
	models = await BackgroundTask.start(func() -> CityModels: return CityModels.create()).finish(get_tree())
	if models.error != "":
		push_warning(models.error)
	materials = await BackgroundTask.start(CityMaterials.create).finish(get_tree())
	var kit := ChunkBuilder.Kit.new()
	kit.source = world
	kit.layout = layout
	kit.models = models
	kit.materials = materials
	kit.tree_mesh = models.tree.commit(materials.foliage)
	kit.palm_mesh = models.palm.commit(materials.foliage)
	var fixed: Array = await BackgroundTask.start(_build_fixed.bind(index)).finish(get_tree())
	for node: Node3D in fixed:
		_fixed.add_child(node)
	var hit := layout.nearest_road_point(SPAWN_NEAR)
	spawn = {"point": hit.get("point", SPAWN_NEAR), "heading": hit.get("heading", 0.0)}
	if focus_node == null and focus == Vector2.ZERO:
		focus = spawn["point"]
	streamer.focus = _focus_world()
	streamer.start(kit)
	_place_preview_camera()
	ready_to_stream.emit()
	return ""


## Landmarks, sea and edge walls as nodes outside the tree (worker thread).
func _build_fixed(index: WorldIndex) -> Array:
	var out: Array = []
	if index == null:
		return out
	for mark in index.landmarks:
		var mesh: LandmarkMeshes = null
		var body := StaticBody3D.new()
		var faces := PackedVector3Array()
		if mark.kind == &"tower":
			var profile := LandmarkProfiles.tower(mark)
			mesh = LandmarkMeshes.tower(profile)
			for step: Vector2 in profile["steps"]:
				_prism(faces, step.x, -1.0, step.y)
			var drum: Vector2 = profile["drum"]
			_prism(faces, drum.x, -1.0, drum.y)
			var levels: Array[Vector2] = profile["levels"]
			var balcony: float = levels[levels.size() / 2].y if not levels.is_empty() else (profile["shaft"] as Vector2).x
			_prism(faces, balcony, drum.y - 0.1, (profile["canopy"] as Vector3).y)
		elif mark.kind == &"temple" and mark.radius > 0.0:
			var g := LandmarkProfiles.gopuram(mark)
			mesh = LandmarkMeshes.gopuram(g)
			var base: Dictionary = g["base"]
			var passage: Vector2 = g["passage"]
			var top: float = base["top"]
			var pier := (float(base["hz0"]) - passage.x) / 2.0
			for side: float in [-1.0, 1.0]:
				ChunkBuilder.solid_box(faces, Vector3(0, top / 2.0 - 0.5, side * (passage.x + pier)), Vector3(base["hx0"], top / 2.0 + 0.5, pier), 0.0)
			ChunkBuilder.solid_box(faces, Vector3(0, (passage.y + top) / 2.0, 0), Vector3(base["hx0"], (top - passage.y) / 2.0, passage.x + 0.01), 0.0)
			var tiers: Array[Dictionary] = g["tiers"]
			var middle := tiers[tiers.size() / 2]
			var vault_top: float = (g["vault"] as Dictionary)["top"]
			ChunkBuilder.solid_box(faces, Vector3(0, (top + vault_top) / 2.0, 0), Vector3(middle["hx0"], (vault_top - top) / 2.0, middle["hz0"]), 0.0)
		if mesh == null:
			body.free()
			continue
		var mi := MeshInstance3D.new()
		mi.name = mark.id
		mi.mesh = mesh.mesh.commit(materials.landmark)
		var holder := _Placed.new()
		holder.name = "Landmark_" + mark.id
		holder.world = mark.position
		holder.add_child(mi)
		var shape := ConcavePolygonShape3D.new()
		shape.backface_collision = true
		shape.set_faces(faces)
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		holder.add_child(body)
		out.append(holder)
	if index.sea != null and index.sea.outline.size() >= 3:
		out.append(_sea(index.sea))
	out.append(_edges(source.get_bounds()))
	return out


## Places itself at its world point when it enters the tree, and follows the floating origin.
class _Placed:
	extends Node3D
	var world: Vector2

	func _enter_tree() -> void:
		position = WorldOrigin.to_scene(world)
		add_to_group(WorldOrigin.GROUP)


## A 24-sided prism with a lid round the origin (`landmarkSolids`).
static func _prism(faces: PackedVector3Array, radius: float, bottom: float, top: float) -> void:
	const SIDES := 24
	for i in SIDES:
		var a0 := TAU * i / SIDES
		var a1 := TAU * (i + 1) / SIDES
		var p0 := Vector3(cos(a0) * radius, 0, sin(a0) * radius)
		var p1 := Vector3(cos(a1) * radius, 0, sin(a1) * radius)
		faces.append_array([p0 + Vector3(0, bottom, 0), p0 + Vector3(0, top, 0), p1 + Vector3(0, bottom, 0)])
		faces.append_array([p1 + Vector3(0, bottom, 0), p0 + Vector3(0, top, 0), p1 + Vector3(0, top, 0)])
		faces.append_array([Vector3(0, top, 0), p1 + Vector3(0, top, 0), p0 + Vector3(0, top, 0)])


## The sea as one flat mesh a little below the ground, and an invisible wall a few metres out
## past the surf (`coastSolids`), so nobody walks or drives into the water.
func _sea(sea: WorldSea) -> Node3D:
	var holder := _Placed.new()
	holder.name = "Sea"
	var c := Vector2.ZERO
	for p in sea.outline:
		c += p
	c /= sea.outline.size()
	holder.world = c
	var b := MeshBuilder.new()
	var local := PackedVector2Array()
	for p in sea.outline:
		local.append(p - c)
	var tri := Geometry2D.triangulate_polygon(local)
	for p in local:
		b.vertex(Vector3(p.x, -0.05, p.y), Vector3.UP, Vector2.ZERO)
	for t in range(0, tri.size(), 3):
		var p0 := local[tri[t]]
		var p1 := local[tri[t + 1]]
		var p2 := local[tri[t + 2]]
		if (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0:
			b.triangle(tri[t], tri[t + 1], tri[t + 2])
		else:
			b.triangle(tri[t], tri[t + 2], tri[t + 1])
	var mesh := b.commit(materials.water)
	if mesh != null:
		var mi := MeshInstance3D.new()
		mi.name = "Water"
		mi.mesh = mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		holder.add_child(mi)
	var faces := PackedVector3Array()
	var bounds := source.get_bounds().grow(50.0)
	var coast := sea.coast
	const SURF := 6.0
	for i in coast.size() - 1:
		var a := coast[i]
		var e := coast[i + 1]
		if not bounds.has_point(a) and not bounds.has_point(e):
			continue
		var length := a.distance_to(e)
		if length < 0.5:
			continue
		var d := (e - a) / length
		var o := Vector2(-d.y, d.x) * (SURF + 1.0)
		var pieces := maxi(1, ceili(length / 200.0))
		for k in pieces:
			var p0 := a + (e - a) * (float(k) / pieces)
			var p1 := a + (e - a) * (float(k + 1) / pieces)
			if not bounds.has_point(p0) and not bounds.has_point(p1):
				continue
			var mid := (p0 + p1) / 2.0 + o - c
			ChunkBuilder.solid_box(faces, Vector3(mid.x, 2.0, mid.y), Vector3(1.0, 2.5, length / pieces / 2.0 + 0.6), atan2(-d.x, -d.y))
	if not faces.is_empty():
		var body := StaticBody3D.new()
		body.name = "CoastWall"
		var shape := ConcavePolygonShape3D.new()
		shape.backface_collision = true
		shape.set_faces(faces)
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		holder.add_child(body)
	return holder


## Four invisible walls round the playable area (`boundarySolids`).
func _edges(bounds: Rect2) -> Node3D:
	var holder := _Placed.new()
	holder.name = "Edges"
	var c := bounds.get_center()
	holder.world = c
	var faces := PackedVector3Array()
	var hw := bounds.size.x / 2.0
	var hd := bounds.size.y / 2.0
	ChunkBuilder.solid_box(faces, Vector3(-hw - 1, 6, 0), Vector3(1, 6, hd + 2), 0.0)
	ChunkBuilder.solid_box(faces, Vector3(hw + 1, 6, 0), Vector3(1, 6, hd + 2), 0.0)
	ChunkBuilder.solid_box(faces, Vector3(0, 6, -hd - 1), Vector3(hw + 2, 6, 1), 0.0)
	ChunkBuilder.solid_box(faces, Vector3(0, 6, hd + 1), Vector3(hw + 2, 6, 1), 0.0)
	var body := StaticBody3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(faces)
	var cs := CollisionShape3D.new()
	cs.shape = shape
	body.add_child(cs)
	holder.add_child(body)
	return holder


func _focus_world() -> Vector2:
	if focus_node != null and focus_node.is_inside_tree():
		return WorldOrigin.to_world(focus_node.global_position)
	return focus


func _process(_delta: float) -> void:
	if streamer == null or not streamer.active:
		return
	if manage_origin and focus_node != null:
		WorldOrigin.follow(focus_node.global_position)
	var f := _focus_world()
	streamer.focus = f
	# The ground plane follows the focus (Jolt caps a boundary plane's size, G-55).
	var here := WorldOrigin.to_scene(f)
	_ground.global_position = Vector3(snappedf(here.x, 100.0), 0.0, snappedf(here.z, 100.0))


## True when the chunks round a point (world metres) are in the scene with their colliders.
func world_ready_around(point: Vector2, radius: float = -1.0) -> bool:
	return streamer != null and streamer.kit != null and streamer.world_ready_around(point, radius)


func wait_ready_around(point: Vector2, radius: float = -1.0, max_frames: int = 60 * 120) -> bool:
	return await streamer.wait_ready_around(point, radius, max_frames)


## True once the ground's collider is in the physics world (a ray from above hits it).
func ground_ready() -> bool:
	if not is_inside_tree():
		return false
	var here := WorldOrigin.to_scene(_focus_world())
	var query := PhysicsRayQueryParameters3D.create(here + Vector3(0, 50, 0), here + Vector3(0, -50, 0))
	return not get_world_3d().direct_space_state.intersect_ray(query).is_empty()


## Moves streaming to a world point (and the preview camera there).
func look_at_world(point: Vector2, heading: float, back: float = 9.0, height: float = 3.2) -> void:
	focus = point
	focus_node = null
	if streamer != null:
		streamer.focus = point
	_place_camera(point, heading, back, height)


func _place_preview_camera() -> void:
	_place_camera(spawn.get("point", focus), spawn.get("heading", 0.0), 9.0, 3.2)


func _place_camera(point: Vector2, heading: float, back: float, height: float) -> void:
	if camera == null:
		return
	var forward := Vector3(-sin(heading), 0.0, -cos(heading))
	var target := WorldOrigin.to_scene(point, 1.5) + forward * 12.0
	camera.look_at_from_position(WorldOrigin.to_scene(point, height) - forward * back, target)
