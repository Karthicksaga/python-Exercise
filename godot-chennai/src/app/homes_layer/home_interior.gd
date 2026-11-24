class_name HomeInterior
extends Node3D
## The inside of a home (G-235): a room shell sized by the home type plus its extensions, a back
## wall and a left wall with windows, a door frame and a door that opens, the floor, the
## furniture (two merged meshes), a doorstep with the kolam, day and night light from the game's
## clock, and the camera. A separate scene made on entering and freed on leaving; it is not the
## OSM building's volume and it never touches the city.
##
## Room coordinates are metres, x right along the back wall, z towards the camera, y up; the
## door is in the right wall (x = width) near the front. The cast model walks in on a route
## (`HomeWalker`) over the grid, round the furniture. Lighting reads `Lighting.at(hour)`: sun and
## sky by day; at night the room's own warm light comes on, the lamps and the window glow, and
## nothing else is a real light.

signal floor_tapped(point: Vector2)
signal arrived

const FLOOR_A := "#b59b69"
const FLOOR_B := "#ab9160"
const FRAME := "#7a5436"
const VERANDAH := "#cfc4ad"
const FOV := 40.0
const TAP_SLOP := 10.0

var data: HomeData
var home: OwnedHome
var room: HomeRoom
var editor: HomeEditor
var walker: HomeWalker = HomeWalker.new()
var camera: Camera3D
var actor: Node3D
var figure: HumanFigure = null
var furniture: FurnitureMesh = FurnitureMesh.new()
## False while a dialog or the fade is up: taps are ignored.
var input_enabled: bool = true
var hour: float = 12.0
## 0 to 1: how far the room is pushed to the left to leave the right side for the furnish panel.
var view_shift: float = 0.0
var door_open: float = 0.0
var door_want: float = 0.0
## Triangles in the room as last built (the report's number).
var triangles: int = 0

var _env: Environment
var _sun: DirectionalLight3D
var _lamp: OmniLight3D
var _shell: MeshInstance3D
var _glass: MeshInstance3D
var _glass_mat: StandardMaterial3D
var _solid_mat: StandardMaterial3D
var _glow_mat: StandardMaterial3D
var _shell_mat: StandardMaterial3D
var _solid: MeshInstance3D
var _glow: MeshInstance3D
var _leaf: Node3D
var _kolam: MeshInstance3D
var _select: MeshInstance3D
var _ground: MeshInstance3D
var _shift_now: float = 0.0
var _look_clock: float = 99.0
var _down: Vector2 = Vector2(-1, -1)
var _walking_in: bool = false


func setup(d: HomeData, h: OwnedHome, e: HomeEditor) -> void:
	data = d
	home = h
	editor = e
	room = e.room
	_make_nodes()
	rebuild()


func _make_nodes() -> void:
	_env = Environment.new()
	_env.background_mode = Environment.BG_COLOR
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	_sun = DirectionalLight3D.new()
	_sun.shadow_enabled = false
	add_child(_sun)
	_lamp = OmniLight3D.new()
	_lamp.omni_attenuation = 1.2
	_lamp.light_color = Color("#ffd08a")
	add_child(_lamp)
	camera = Camera3D.new()
	camera.name = "InteriorCamera"
	camera.fov = FOV
	camera.near = 0.1
	camera.far = 120.0
	# The camera's own environment wins over the city's WorldEnvironment (suspended anyway).
	camera.environment = _env
	add_child(camera)
	_shell_mat = _vertex_material()
	_solid_mat = _vertex_material()
	_glow_mat = _vertex_material()
	_glass_mat = StandardMaterial3D.new()
	_glass_mat.albedo_color = Color("#9fc9e6")
	_glass_mat.emission = Color("#6a86b8")
	_shell = MeshInstance3D.new()
	_shell.name = "Shell"
	add_child(_shell)
	_glass = MeshInstance3D.new()
	_glass.name = "Windows"
	add_child(_glass)
	_ground = MeshInstance3D.new()
	_ground.name = "Ground"
	add_child(_ground)
	_solid = MeshInstance3D.new()
	_solid.name = "Furniture"
	add_child(_solid)
	_glow = MeshInstance3D.new()
	_glow.name = "FurnitureGlow"
	add_child(_glow)
	_leaf = Node3D.new()
	_leaf.name = "DoorLeaf"
	add_child(_leaf)
	_kolam = MeshInstance3D.new()
	_kolam.name = "Kolam"
	add_child(_kolam)
	_select = MeshInstance3D.new()
	_select.name = "Selection"
	var sm := StandardMaterial3D.new()
	sm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sm.albedo_color = Color(1.0, 0.72, 0.05, 0.38)
	sm.no_depth_test = false
	_select.material_override = sm
	_select.visible = false
	add_child(_select)
	actor = Node3D.new()
	actor.name = "Actor"
	add_child(actor)


static func _vertex_material() -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.roughness = 0.9
	return m


## Rebuilds the shell, the door, the kolam and the furniture (after the home changed).
func rebuild() -> void:
	room = editor.room
	_build_shell()
	_build_door()
	_build_kolam()
	rebuild_furniture()
	set_hour(hour)


func rebuild_furniture() -> void:
	furniture.build(home.items, data.props)
	var m := furniture.meshes(_solid_mat, _glow_mat)
	_solid.mesh = m[0]
	_glow.mesh = m[1]
	triangles = furniture.triangles + _shell_triangles


var _shell_triangles: int = 0


func _build_shell() -> void:
	var w := float(room.width)
	var d := float(room.depth)
	var h := HomeRoom.HEIGHT
	var wall := home.wall
	var b := MeshBuilder.new()
	# The floor, a tile to the metre in two tones.
	for x in room.width:
		for z in room.depth:
			PropMesh.add_part(b, {"t": "box", "a": [1.0, 0.2, 1.0], "c": FLOOR_A if (x + z) % 2 == 0 else FLOOR_B, "p": [x + 0.5, -0.1, z + 0.5]})
	_box(b, Vector3(3.0, 0.14, d), Vector3(w + 1.5, -0.07, d * 0.5), VERANDAH)
	_box(b, Vector3(w, h, 0.2), Vector3(w * 0.5, h * 0.5, -0.1), wall)
	_box(b, Vector3(0.2, h, d), Vector3(-0.1, h * 0.5, d * 0.5), wall)
	# A skirting and a darker top rail make the walls read as walls.
	_box(b, Vector3(w, 0.12, 0.05), Vector3(w * 0.5, 0.06, 0.03), FRAME)
	_box(b, Vector3(0.05, 0.12, d), Vector3(0.03, 0.06, d * 0.5), FRAME)
	# Window frames (the glass is a second mesh so it can glow).
	var wx := minf(w - 2.0, 3.2)
	_box(b, Vector3(1.6, 1.3, 0.1), Vector3(wx, 1.8, 0.02), FRAME)
	var wz := d * 0.5 + 0.2
	_box(b, Vector3(0.1, 1.3, 1.6), Vector3(0.02, 1.8, wz), FRAME)
	# The door frame in the right wall.
	var dz := d - HomeRoom.DOOR_FROM_FRONT
	_box(b, Vector3(0.16, 2.3, 0.14), Vector3(w + 0.04, 1.15, dz - 0.66), FRAME)
	_box(b, Vector3(0.16, 2.3, 0.14), Vector3(w + 0.04, 1.15, dz + 0.66), FRAME)
	_box(b, Vector3(0.16, 0.14, 1.46), Vector3(w + 0.04, 2.3, dz), FRAME)
	_shell.mesh = b.commit(_shell_mat)
	_shell_triangles = b.triangle_count()
	var g := MeshBuilder.new()
	_box(g, Vector3(1.4, 1.1, 0.06), Vector3(wx, 1.8, 0.07), "#9fc9e6")
	_box(g, Vector3(0.06, 1.1, 1.4), Vector3(0.07, 1.8, wz), "#9fc9e6")
	_glass.mesh = g.commit(_glass_mat)
	var gb := MeshBuilder.new()
	_box(gb, Vector3(60.0, 0.1, 60.0), Vector3(w * 0.5, -0.25, d * 0.5), "#6d7459")
	var gm := _vertex_material()
	_ground.mesh = gb.commit(gm)


func _build_door() -> void:
	var w := float(room.width)
	var dz := float(room.depth) - HomeRoom.DOOR_FROM_FRONT
	for c in _leaf.get_children():
		c.queue_free()
	_leaf.position = Vector3(w + 0.04, 0.0, dz + HomeRoom.DOOR_WIDTH * 0.5 - 0.02)
	var b := MeshBuilder.new()
	_box(b, Vector3(0.07, 2.15, HomeRoom.DOOR_WIDTH - 0.04), Vector3(0.0, 1.08, -(HomeRoom.DOOR_WIDTH - 0.04) * 0.5), "#7a4a2e")
	_box(b, Vector3(0.02, 0.8, 0.8), Vector3(-0.045, 1.5, -0.55), "#5e3822")
	_box(b, Vector3(0.02, 0.8, 0.8), Vector3(-0.045, 0.62, -0.55), "#5e3822")
	var mi := MeshInstance3D.new()
	mi.mesh = b.commit(_vertex_material())
	_leaf.add_child(mi)
	_apply_door()


func _apply_door() -> void:
	# Hinged on the front post, swinging out of the room (+x).
	_leaf.rotation.y = -1.75 * door_open


func _build_kolam() -> void:
	if not home.kolam:
		_kolam.visible = false
		return
	var w := float(room.width)
	var dz := float(room.depth) - HomeRoom.DOOR_FROM_FRONT
	var plane := PlaneMesh.new()
	plane.size = Vector2(2.4, 2.4)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = ImageTexture.create_from_image(HomeKolam.make())
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.roughness = 1.0
	plane.material = mat
	_kolam.mesh = plane
	_kolam.position = Vector3(w + 1.7, 0.02, dz)
	_kolam.visible = true


static func _box(b: MeshBuilder, size: Vector3, at: Vector3, hex: String) -> void:
	PropMesh.add_part(b, {"t": "box", "a": [size.x, size.y, size.z], "c": hex, "p": [at.x, at.y, at.z]})


# --- light --------------------------------------------------------------------------------

## The light and sky for an hour (0 to 24): the city's own look by day, the room's lamp at night.
func set_hour(h: float) -> void:
	hour = h
	if _env == null:
		return
	var look := Lighting.at(h)
	var night := look.night
	_env.background_color = look.zenith.lerp(look.horizon, 0.45)
	_env.ambient_light_color = look.hemi_sky.lerp(Color("#ffe2b0"), 0.25)
	_env.ambient_light_energy = lerpf(0.55, 0.4, night)
	_env.tonemap_exposure = clampf(look.exposure * 0.85, 0.7, 1.2)
	_sun.light_color = look.light_color
	_sun.light_energy = look.light_intensity * 0.5
	_sun.look_at_from_position(Vector3.ZERO, -look.light)
	_sun.visible = night < 0.95
	_lamp.position = Vector3(float(room.width) * 0.5, HomeRoom.HEIGHT - 0.35, float(room.depth) * 0.5)
	_lamp.omni_range = maxf(float(room.width), float(room.depth)) * 1.6
	_lamp.light_energy = lerpf(0.0, 2.2, night)
	_lamp.visible = night > 0.02
	# The lamps and the window glow once it is dark.
	var lit := night > 0.5
	_glow_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED if lit else BaseMaterial3D.SHADING_MODE_PER_PIXEL
	_glass_mat.emission_enabled = lit
	_glass_mat.emission_energy_multiplier = 0.9 * night
	_glass_mat.albedo_color = Color("#9fc9e6").lerp(Color("#27324a"), night)


# --- the person ---------------------------------------------------------------------------

## Takes the cast model into the room (the player's own, with its clips).
func attach_figure(f: HumanFigure) -> void:
	figure = f
	figure.reparent(actor, false)
	figure.position = Vector3.ZERO
	_sync_actor()


## Hands the model back; the caller puts it on the player's body again.
func detach_figure() -> HumanFigure:
	var f := figure
	figure = null
	return f


func place_walker(at: Vector2, yaw: float) -> void:
	walker.place(at, yaw)
	_sync_actor()


## The person comes through the open door and a few steps into the room.
func walk_in() -> void:
	var w := float(room.width)
	var dz := float(room.depth) - HomeRoom.DOOR_FROM_FRONT
	place_walker(Vector2(w + 1.1, dz), PI * 0.5)
	var route := PackedVector2Array([walker.position, Vector2(w - 0.5, dz)])
	var inside := Vector2(w - 1.6, dz)
	if editor.walkable(room.cell_at(inside)):
		route.append(inside)
	walker.go(route)
	_walking_in = true


## Walks to a floor point round the furniture; false when it cannot be reached.
func walk_to(point: Vector2) -> bool:
	var route := editor.path(walker.position, point)
	if route.is_empty():
		return false
	walker.go(route)
	return true


## The person's way out: to the door and beyond.
func walk_out() -> void:
	var w := float(room.width)
	var dz := float(room.depth) - HomeRoom.DOOR_FROM_FRONT
	var route := editor.path(walker.position, Vector2(w - 0.5, dz))
	if route.is_empty():
		route = PackedVector2Array([walker.position, Vector2(w - 0.5, dz)])
	route.append(Vector2(w + 1.2, dz))
	walker.go(route)


func near_door(distance: float = 1.8) -> bool:
	return walker.position.distance_to(room.door_point()) <= distance


func _sync_actor() -> void:
	actor.position = Vector3(walker.position.x, 0.0, walker.position.y)
	if figure != null:
		figure.rotation.y = walker.yaw


# --- selection ----------------------------------------------------------------------------

func show_selection(it: PlacedProp) -> void:
	if it == null:
		_select.visible = false
		return
	var def := data.props.get_prop(it.k)
	if def == null:
		_select.visible = false
		return
	var box := BoxMesh.new()
	var at := Vector3.ZERO
	match def.kind:
		PropDef.CEILING:
			box.size = Vector3(0.9, 0.5, 0.9)
			at = Vector3(float(it.x) + 0.5, HomeRoom.HEIGHT - 0.3, float(it.z) + 0.5)
		PropDef.WALL:
			var t := FurnitureMesh.transform_of(def, it)
			box.size = Vector3(float(def.w) * 0.95, 0.9, 0.3) if it.wall == "b" else Vector3(0.3, 0.9, float(def.w) * 0.95)
			at = t.origin
		_:
			var size := def.size_at(it.r)
			box.size = Vector3(float(size.x) * 0.96, 0.08, float(size.y) * 0.96)
			at = Vector3(float(it.x) + float(size.x) * 0.5, 0.05, float(it.z) + float(size.y) * 0.5)
	_select.mesh = box
	_select.position = at
	_select.visible = true


# --- camera and taps ----------------------------------------------------------------------

func _fit_camera(dt: float) -> void:
	var vp := get_viewport().get_visible_rect().size
	var aspect := maxf(0.5, vp.x / maxf(vp.y, 1.0))
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	var w := float(room.width) + 2.0
	var d := float(room.depth)
	var centre := Vector3(float(room.width) * 0.5 + 0.6, 0.7, d * 0.5)
	var radius := 0.5 * sqrt(w * w + d * d + 9.0) * 0.92
	var half_v := deg_to_rad(FOV) * 0.5
	var half_h := atan(tan(half_v) * aspect)
	var dist := radius / sin(minf(half_v, half_h))
	var dir := Vector3(0.62, 0.72, 1.0).normalized()
	_shift_now = lerpf(_shift_now, view_shift, 1.0 - exp(-dt * 8.0))
	var right := (-dir).cross(Vector3.UP).normalized()
	# Pushing the room left leaves the right third of the screen for the panel.
	var shift := _shift_now * dist * tan(half_h) * 0.62
	camera.global_position = centre + dir * dist + right * shift
	camera.look_at(centre + right * shift, Vector3.UP)


## The floor point (x, z in metres) under a screen position, or null when the ray misses.
func floor_point_at(screen: Vector2) -> Variant:
	var o := camera.project_ray_origin(screen)
	var n := camera.project_ray_normal(screen)
	if absf(n.y) < 0.0001:
		return null
	var t := -o.y / n.y
	if t < 0.0:
		return null
	var p := o + n * t
	return Vector2(p.x, p.z)


func _unhandled_input(event: InputEvent) -> void:
	if not input_enabled or not is_inside_tree() or not camera.current:
		return
	var mb := event as InputEventMouseButton
	if mb == null or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if mb.pressed:
		_down = mb.position
	elif _down.x >= 0.0:
		var moved := mb.position.distance_to(_down)
		_down = Vector2(-1, -1)
		if moved <= TAP_SLOP:
			var p: Variant = floor_point_at(mb.position)
			if p is Vector2:
				floor_tapped.emit(p)


func _process(dt: float) -> void:
	if camera == null or room == null:
		return
	_fit_camera(dt)
	door_open = move_toward(door_open, door_want, dt * 2.0)
	_apply_door()
	var was := walker.arrived()
	walker.step(dt)
	_sync_actor()
	if figure != null:
		figure.advance(dt, walker.speed, true)
	if not was and walker.arrived() and _walking_in:
		_walking_in = false
		arrived.emit()
	_look_clock += dt
	if _look_clock >= 0.5:
		_look_clock = 0.0
		set_hour(GameLoop.clock.hour)
