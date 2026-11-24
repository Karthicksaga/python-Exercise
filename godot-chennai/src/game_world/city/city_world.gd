class_name CityWorld
extends Node3D
## The streamed city (phase 1, decisions G-50…G-59): the chunk streamer, the always-loaded
## landmarks and sea, the ground plane and the map's edge walls. It holds no gameplay.
##
## `setup(source)` prepares everything on worker threads (road layout, prop models, materials,
## landmark specs and models, the sea), then streaming runs every frame round `focus_node` (or `focus`).
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
## Landmark models from their specs (G-183); off leaves the OSM buildings in their place (for
## measuring the landmarks' cost).
@export var show_landmarks: bool = true
## Recentre the floating origin on `focus_node` when it wanders far (G-7).
@export var manage_origin: bool = false
## The Three.js game's spawn: the nearest road to this point (`content.ts`).
const SPAWN_NEAR := Vector2(40.0, 60.0)

var source: WorldSource
var layouts: CityLayouts
var models: CityModels
var materials: CityMaterials
var streamer: ChunkStreamer
## {"point": Vector2, "heading": float} on the road nearest SPAWN_NEAR.
var spawn: Dictionary = {}
var error: String = ""
## Landmark specs (G-181); the chunk builder leaves out OSM buildings under their footprints.
var landmarks: Array[LandmarkSpec] = []

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
	layouts = await BackgroundTask.start(CityLayouts.create.bind(world)).finish(get_tree())
	spawn = await BackgroundTask.start(_find_spawn).finish(get_tree())
	models = await BackgroundTask.start(func() -> CityModels: return CityModels.create()).finish(get_tree())
	if models.error != "":
		push_warning(models.error)
	# Materials on the main thread: a ShaderMaterial set up on a worker lost its parameters
	# under the Compatibility renderer (G-52).
	materials = CityMaterials.create()
	var kit := ChunkBuilder.Kit.new()
	kit.source = world
	kit.layouts = layouts
	kit.models = models
	kit.materials = materials
	kit.tree_mesh = models.tree.commit(materials.foliage)
	kit.palm_mesh = models.palm.commit(materials.foliage)
	var sea := world.get_sea()
	if sea != null:
		kit.sea = sea.outline
		var lo := Vector2(INF, INF)
		var hi := Vector2(-INF, -INF)
		for p in sea.outline:
			lo = lo.min(p)
			hi = hi.max(p)
		kit.sea_box = Rect2(lo, hi - lo)
	kit.signs = SignCategories.shared()
	kit.palettes = AreaPalettes.load_file()
	if show_landmarks:
		landmarks = await BackgroundTask.start(func() -> Array[LandmarkSpec]: return LandmarkSpec.load_all()).finish(get_tree())
	kit.landmarks = landmarks
	kit.tree_triangles = models.tree.triangle_count()
	kit.palm_triangles = models.palm.triangle_count()
	var fixed: Array = await BackgroundTask.start(_build_fixed).finish(get_tree())
	for node: Node3D in fixed:
		_fixed.add_child(node)
	if focus_node == null and focus == Vector2.ZERO:
		focus = spawn["point"]
	streamer.focus = _focus_world()
	streamer.start(kit)
	_place_preview_camera()
	ready_to_stream.emit()
	return ""


## The nearest road point to SPAWN_NEAR and its heading (worker thread).
func _find_spawn() -> Dictionary:
	var hit := nearest_road_point(SPAWN_NEAR)
	return {"point": hit.get("point", SPAWN_NEAR), "heading": hit.get("heading", 0.0)}


## Nearest drivable road point to a world point (`CityLayout.nearest_road_point`); may build a
## tile's layout, so prefer a worker thread.
func nearest_road_point(point: Vector2) -> Dictionary:
	return layouts.layout_for(source.cell_at(point)).nearest_road_point(point)


## Landmarks, sea and edge walls as nodes outside the tree (worker thread). Landmark models come
## from their specs and GLBs (`LandmarkModels`, G-183); the GLBs load here, on the worker.
func _build_fixed() -> Array:
	var out: Array = []
	var bounds := source.get_bounds()
	for spec in landmarks:
		if not bounds.has_point(spec.origin):
			continue
		var built := LandmarkModels.build(spec, materials.landmark)
		if built.error != "":
			push_warning(built.error)
		if built.node != null:
			out.append(built.node)
	var sea := source.get_sea()
	if sea != null and sea.outline.size() >= 3:
		out.append(_sea(sea))
	out.append(_edges(source.get_bounds()))
	return out


## Places itself at its world point when it enters the tree, and follows the floating origin.
class _Placed:
	extends Node3D
	var world: Vector2

	func _enter_tree() -> void:
		position = WorldOrigin.to_scene(world)
		add_to_group(WorldOrigin.GROUP)


## The sea is drawn by the chunks it covers (ground water, `GroundMeshes.sea`); here only an
## invisible wall a few metres out
## past the surf (`coastSolids`), so nobody walks or drives into the water.
func _sea(sea: WorldSea) -> Node3D:
	var holder := _Placed.new()
	holder.name = "Sea"
	var c := Vector2.ZERO
	for p in sea.outline:
		c += p
	c /= sea.outline.size()
	holder.world = c
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
