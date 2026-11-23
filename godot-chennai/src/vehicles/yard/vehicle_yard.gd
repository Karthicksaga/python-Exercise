class_name VehicleYard
extends Node3D
## A test ground for the vehicles (no city): a big flat lot with a road, a wall to crash into,
## golden-hour light and haze, every variant parked in a row, the rider, a `Driving` session,
## the chase camera and the touch controls. Used by the scene tests and the screenshots; the
## real game wires the same pieces into the streamed city (`Main` composition root).

const ROW_START := Vector3(-30, 0, 0)
const ROW_STEP := 7.0
## The crash wall: across the road at this z, this thick.
const WALL_Z := -160.0
const WALL_THICKNESS := 0.3

var driving: Driving
var rider: VehicleRider
var camera: ChaseCamera
var controls: DrivingControls
var vehicles: Dictionary = {}
var wall: StaticBody3D


func _ready() -> void:
	_build_world()
	rider = VehicleRider.new()
	rider.name = "Rider"
	add_child(rider)
	rider.place(Vector3(0, 0.05, 12), 0)
	camera = ChaseCamera.new()
	camera.name = "ChaseCamera"
	camera.fov = 62
	camera.far = 900
	add_child(camera)
	camera.current = true
	var ui := CanvasLayer.new()
	ui.name = "Ui"
	add_child(ui)
	controls = DrivingControls.new()
	ui.add_child(controls)
	driving = Driving.new()
	driving.name = "Driving"
	driving.rider = rider
	driving.camera = camera
	driving.controls = controls
	add_child(driving)
	camera.target = rider


## Every variant parked in a row along x, noses north (-Z).
func park_all() -> void:
	var i := 0
	for id in VehicleCatalog.variant_ids():
		spawn(id, ROW_START + Vector3(i * ROW_STEP, 0, 0), 0.0)
		i += 1


func spawn(variant_id: StringName, where: Vector3, heading: float, vehicle_id: StringName = &"") -> Vehicle:
	var v := Vehicle.create(variant_id, vehicle_id)
	v.place(where, heading)
	add_child(v)
	vehicles[v.id] = v
	return v


func _build_world() -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color("#6f9fd0")
	sky_mat.sky_horizon_color = Color("#f1d2a8")
	sky_mat.ground_horizon_color = Color("#d9b98f")
	sky_mat.ground_bottom_color = Color("#6d5d4b")
	sky_mat.sun_angle_max = 20.0
	sky.sky_material = sky_mat
	e.sky = sky
	e.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	e.ambient_light_energy = 0.45
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.fog_enabled = true
	e.fog_light_color = Color("#e8cfa8")
	e.fog_density = 0.0016
	env.environment = e
	add_child(env)
	var sun := DirectionalLight3D.new()
	sun.name = "Sun"
	sun.light_color = Color("#ffd9a0")
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80.0
	sun.rotation = Vector3(deg_to_rad(-28), deg_to_rad(-130), 0)
	add_child(sun)
	var ground := _ground(600.0)
	ground.name = "Ground"
	# The road north from the row, with kerbs, towards the wall.
	_box("Road", Vector3(14, 0.02, 380), Vector3(0, 0.01, -150), Color("#3b3d40"), false)
	for side: float in [-1.0, 1.0]:
		_box("Line%d" % int(side), Vector3(0.15, 0.025, 380), Vector3(side * 6.6, 0.012, -150), Color("#e8e2d0"), false)
	wall = _box("Wall", Vector3(30, 4, WALL_THICKNESS), Vector3(0, 2, WALL_Z), Color("#d8c7a6"), true)
	# A few low buildings for scale and for the camera to be pulled in by.
	var colours: Array[Color] = [Color("#9ec5d6"), Color("#e7b7a3"), Color("#cfe3c0"), Color("#efe4c8")]
	for i in 8:
		var z := -20.0 - i * 26.0
		_box("House%dL" % i, Vector3(10, 7 + (i % 3) * 3, 14), Vector3(-15, 3.5 + (i % 3) * 1.5, z), colours[i % 4], true)
		_box("House%dR" % i, Vector3(10, 6 + (i % 2) * 4, 14), Vector3(15, 3 + (i % 2) * 2, z), colours[(i + 2) % 4], true)


func _ground(half: float) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.collision_layer = PhysicsLayers.WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(half * 2.0, 1.0, half * 2.0)
	shape.shape = box
	shape.position = Vector3(0, -0.5, 0)
	body.add_child(shape)
	var mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(half * 2.0, half * 2.0)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#7d6a52")
	mat.roughness = 1.0
	plane.material = mat
	mesh.mesh = plane
	body.add_child(mesh)
	add_child(body)
	return body


func _box(node_name: String, size: Vector3, at: Vector3, colour: Color, solid: bool) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = at
	body.collision_layer = PhysicsLayers.WORLD if solid else 0
	var mesh := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.roughness = 0.9
	bm.material = mat
	mesh.mesh = bm
	body.add_child(mesh)
	if solid:
		var shape := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = size
		shape.shape = box
		body.add_child(shape)
	add_child(body)
	return body
