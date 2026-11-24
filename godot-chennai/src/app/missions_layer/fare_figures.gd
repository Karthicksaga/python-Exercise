class_name FareFigures
extends Node3D
## People getting in and out at a pick-up or drop (port of the Three.js `FareFigures`,
## `GoodsFigures` and `StretcherFigures`, simplified): the rules (`FareStop.people()`,
## `GoodsStop.person()`) say what stage each person is at; this places them in the city.
##
## A boarder waits on the pavement at the stop's kerb spot, walks to the vehicle's passenger
## door on the kerb side (the vehicle's `passengers` anchors), the door leaf swings, they step to
## their seat anchor and are hidden inside (no seated pose yet: the Cast/Player phase). A leaver
## comes out of the same door and walks off along the pavement. A patient lies on a stretcher
## wheeled by a paramedic; someone handing goods over carries a box that goes into the vehicle
## halfway through. The figures are cast people (`assets/people/people.json`, adults only),
## loaded in the background; until one has loaded its place is still computed (`people`).

const MANIFEST := "res://assets/people/people.json"
## Adults who ride as passengers, and who hand goods over (cast ids).
const RIDERS: PackedStringArray = ["college-student-f", "it-professional-m", "homemaker", "office-employee-m", "elderly-woman", "manager", "young-woman", "tourist", "temple-goer-f", "father"]
const SENDERS: PackedStringArray = ["shopkeeper-m", "tea-vendor", "shopkeeper-f", "fruit-vendor"]
const PARAMEDIC := "health-worker"
## People waiting at one kerb spot stand this far apart.
const SPREAD := 0.8
## How far a seated person is lowered from the seat anchor (the anchor is a standing height), and
## how near the player must be for a waiting person to wave (metres).
const SEAT_SINK := 0.42
const WAVE_NEAR := 220.0

## What the rules and the world say this frame; set by `MissionsLayer`.
var vehicle: Vehicle = null
## Everyone drawn now: [{stage, action, position: Vector3 (scene), visible, kind}].
var people: Array[Dictionary] = []
var _figures: Array[HumanFigure] = []
var _loading: Dictionary[int, bool] = {}
var _stretcher: Node3D = null
var _box: MeshInstance3D = null
var _manifest: PeopleManifest = null
var _last: Dictionary[int, Vector3] = {}
## False skips loading cast models (unit-speed tests that only read `people`).
var load_models := true
## G-283: where the player is (scene position): people waiting at a pick-up face them and, when
## they are near, wave. `Vector3.INF`: unknown.
var watch := Vector3.INF
var _clock := 0.0


func _ready() -> void:
	name = "FareFigures"
	_manifest = PeopleManifest.open(MANIFEST)
	_stretcher = _make_stretcher()
	add_child(_stretcher)
	_box = MeshInstance3D.new()
	_box.name = "Goods"
	var bm := BoxMesh.new()
	bm.size = Vector3(0.42, 0.3, 0.34)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color("#b8865a")
	bm.material = mat
	_box.mesh = bm
	_box.visible = false
	add_child(_box)


static func _make_stretcher() -> Node3D:
	var n := Node3D.new()
	n.name = "Stretcher"
	var frame := MeshInstance3D.new()
	var fm := BoxMesh.new()
	fm.size = Vector3(0.6, 0.08, 1.95)
	var metal := StandardMaterial3D.new()
	metal.albedo_color = Color("#c9ced6")
	metal.metallic = 0.6
	fm.material = metal
	frame.mesh = fm
	frame.position.y = 0.78
	n.add_child(frame)
	var sheet := MeshInstance3D.new()
	var sm := BoxMesh.new()
	sm.size = Vector3(0.5, 0.22, 1.5)
	var white := StandardMaterial3D.new()
	white.albedo_color = Color("#f2f0ea")
	sm.material = white
	sheet.mesh = sm
	sheet.position = Vector3(0, 0.93, 0.15)
	n.add_child(sheet)
	var head := MeshInstance3D.new()
	var hm := SphereMesh.new()
	hm.radius = 0.12
	hm.height = 0.24
	var skin := StandardMaterial3D.new()
	skin.albedo_color = Color("#8a5a3c")
	hm.material = skin
	head.mesh = hm
	head.position = Vector3(0, 0.98, -0.72)
	n.add_child(head)
	for x: float in [-0.25, 0.25]:
		var leg := MeshInstance3D.new()
		var lm := BoxMesh.new()
		lm.size = Vector3(0.04, 0.74, 0.04)
		lm.material = metal
		leg.mesh = lm
		leg.position = Vector3(x, 0.37, 0)
		n.add_child(leg)
	n.visible = false
	return n


## The door the kerb-side passengers use: the passenger door nearest the kerb, or the driver's
## side for a vehicle without one (the bike's pillion).
static func kerb_door(v: Vehicle, kerb: Vector3) -> VehicleType.PassengerDoor:
	var best: VehicleType.PassengerDoor = null
	var best_d := INF
	for d in v.type.passengers:
		var p := v.ground_point(d.point)
		var dist := p.distance_squared_to(kerb)
		if dist < best_d:
			best_d = dist
			best = d
	return best


## Update for this frame: `fare` ({} none) from `MissionSession.fare_scene()`, `goods` from
## `goods_scene()`, the vehicle the player drives (null on foot), `ground_y` the street's height.
func show_scene(dt: float, fare: Dictionary, goods: Dictionary, v: Vehicle, ground_y: float, upcoming: Dictionary = {}) -> void:
	vehicle = v
	_clock += dt
	people.clear()
	var patient := false
	# The pick-up the player is heading for stands there already, before the objective is current.
	var shown := fare if not fare.is_empty() else upcoming
	if not shown.is_empty():
		var stop: FareStop = shown["stop"]
		patient = stop.fare.patient
		var kerb := WorldOrigin.to_scene_xz(stop.fare.kerb_x, stop.fare.kerb_z, ground_y)
		var list := stop.people()
		for i in list.size():
			people.append(_person(list[i], i, kerb, stop.fare.patient, v, ground_y))
	if not goods.is_empty():
		var g: GoodsStop = goods["stop"]
		var kerb_g := WorldOrigin.to_scene_xz(g.goods.kerb_x, g.goods.kerb_z, ground_y)
		people.append(_goods_person(g, kerb_g, v))
	_draw(dt, patient)


func _person(p: Dictionary, i: int, kerb: Vector3, fare_patient: bool, v: Vehicle, ground_y: float) -> Dictionary:
	var stage: String = p["stage"]
	var share: float = p["share"]
	var spot := kerb + Vector3(([0, 1, -1][i % 3] as int) * SPREAD, 0, (i / 3) * SPREAD)
	var out := {"stage": stage, "action": p["action"], "position": spot, "visible": true, "kind": "rider", "speed": 0.0, "face": Vector3.ZERO}
	if v == null:
		out["visible"] = stage in ["waiting", "leaving", "gone"] and stage != "gone"
		if stage == "waiting":
			_look_and_wave(out, spot)
		return out
	var d := kerb_door(v, kerb)
	var door := v.ground_point(d.point) if d != null else v.ground_point(Vector2(-(v.type.spec.half_extents.x + 0.6), 0.0))
	door.y = ground_y
	var seat := v.global_transform * (d.inside if d != null else v.type.driver)
	var walk_seconds: float = maxf(0.1, float(p["walk_seconds"]))
	match stage:
		"waiting":
			out["face"] = door
			_look_and_wave(out, spot)
		"walking":
			out["position"] = spot.lerp(door, share)
			out["speed"] = spot.distance_to(door) / walk_seconds
			out["face"] = door
			_door(v, d, 0.0)
		"entering":
			out["position"] = door.lerp(seat, share)
			out["face"] = seat
			_door(v, d, sin(share * PI))
		"inside", "riding":
			# Shown on board (G-283): at the seat, facing the way the vehicle goes, hips on the
			# cushion. `seated` tells the pose layer to sit them once the seat pose is merged; until
			# then the standing figure is lowered so its legs are inside the seat and floor. The
			# patient lies on a stretcher and is not drawn inside an ambulance.
			out["position"] = seat - Vector3(0, SEAT_SINK, 0)
			out["visible"] = not fare_patient
			out["seated"] = true
			out["face"] = seat - v.global_transform.basis.z
			_door(v, d, 0.0)
		"exiting":
			out["position"] = seat.lerp(door, share)
			out["face"] = door
			_door(v, d, sin(share * PI))
		"leaving":
			var away := kerb + (kerb - door).normalized() * 0.0 + (kerb - door).cross(Vector3.UP).normalized() * float(FareStop.FARES["walk_off"])
			var path_len := door.distance_to(kerb) + kerb.distance_to(away)
			var along := share * path_len
			var first := door.distance_to(kerb)
			out["position"] = door.lerp(kerb, along / first) if along < first and first > 0.0 else kerb.lerp(away, (along - first) / maxf(0.01, path_len - first))
			out["speed"] = path_len / walk_seconds
			out["face"] = kerb if along < first else away
			_door(v, d, 0.0)
		"gone":
			out["visible"] = false
	return out


## A waiting person turns to the player and, when the player is near, waves.
func _look_and_wave(out: Dictionary, spot: Vector3) -> void:
	if watch == Vector3.INF:
		return
	out["face"] = watch
	out["wave"] = Vector2(watch.x - spot.x, watch.z - spot.z).length() <= WAVE_NEAR


func _goods_person(g: GoodsStop, kerb: Vector3, v: Vehicle) -> Dictionary:
	var p := g.person()
	var stage: String = p["stage"]
	var out := {"stage": stage, "action": g.goods.action, "position": kerb, "visible": true, "kind": "sender", "speed": 0.0, "face": Vector3.ZERO, "holder": p["holder"]}
	if v == null:
		return out
	var d := kerb_door(v, kerb)
	var door := v.ground_point(d.point) if d != null else v.ground_point(Vector2(v.type.spec.half_extents.x + 0.5, v.type.spec.half_extents.z * 0.6))
	door.y = kerb.y
	match stage:
		"walking":
			out["position"] = kerb.lerp(door, float(p["share"]))
			out["speed"] = kerb.distance_to(door) / maxf(0.1, float(p["walk_seconds"]))
			out["face"] = door
		"handing", "done":
			out["position"] = door
			out["face"] = v.global_position
	return out


static func _door(v: Vehicle, d: VehicleType.PassengerDoor, amount: float) -> void:
	if d != null and d.leaf >= 0:
		v.set_passenger_door(d.leaf, amount)


func _draw(dt: float, patient: bool) -> void:
	var used := 0
	_stretcher.visible = false
	_box.visible = false
	for i in people.size():
		var p := people[i]
		var at: Vector3 = p["position"]
		if patient and p["kind"] == "rider":
			# The patient lies on the stretcher; the paramedic walks behind it.
			_stretcher.visible = bool(p["visible"])
			_stretcher.global_position = at
			_face(_stretcher, at, p["face"])
			var medic := _figure(used, PARAMEDIC)
			used += 1
			if medic != null:
				var back := -_stretcher.global_transform.basis.z.normalized()
				medic.visible = bool(p["visible"])
				medic.global_position = at - back * 1.3
				_face(medic, medic.global_position, at)
				medic.advance(dt, float(p["speed"]), true)
			continue
		var fig := _figure(used, SENDERS[i % SENDERS.size()] if p["kind"] == "sender" else RIDERS[i % RIDERS.size()])
		used += 1
		if p["kind"] == "sender":
			var in_hands: bool = p.get("holder", "hands") == "hands"
			_box.visible = in_hands
			_box.global_position = at + Vector3(0, 1.0, 0) + (Vector3.ZERO if fig == null else -fig.global_transform.basis.z * 0.35)
		if fig == null:
			continue
		fig.visible = bool(p["visible"])
		fig.global_position = at
		_face(fig, at, p["face"])
		fig.advance(dt, float(p["speed"]), true)
		if bool(p.get("wave", false)):
			FareWave.apply(fig, _clock)
	for k in range(used, _figures.size()):
		if _figures[k] != null:
			_figures[k].visible = false


static func _face(n: Node3D, at: Vector3, towards: Variant) -> void:
	if not (towards is Vector3):
		return
	var t: Vector3 = towards
	var flat := Vector3(t.x - at.x, 0, t.z - at.z)
	if flat.length_squared() > 0.0001:
		n.global_basis = Basis.looking_at(flat.normalized(), Vector3.UP)


## The i-th figure, loading person `id` the first time; null while it loads.
func _figure(i: int, id: String) -> HumanFigure:
	while _figures.size() <= i:
		_figures.append(null)
	if _figures[i] != null and _figures[i].is_ready():
		return _figures[i]
	if not load_models or _loading.has(i):
		return null
	_loading[i] = true
	_load(i, id)
	return null


func _load(i: int, id: String) -> void:
	var path := _manifest.model_path(id)
	if path == "":
		return
	var f := HumanFigure.new()
	f.name = "Person%d" % i
	f.visible = false
	add_child(f)
	var error := await f.load_model(path, _manifest.height(id))
	if error != "":
		push_warning("fare figure %s: %s" % [id, error])
		f.queue_free()
		return
	_figures[i] = f


## Stages of everyone shown, for tests: ["waiting", ...].
func stages() -> Array[String]:
	var out: Array[String] = []
	for p in people:
		out.append(str(p["stage"]))
	return out
