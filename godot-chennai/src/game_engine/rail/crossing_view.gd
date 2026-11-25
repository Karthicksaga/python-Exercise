class_name CrossingView
extends Node3D
## A mapped level crossing (G-327): a boom barrier on each side of the track, across the road
## (the road is taken as crossing square to the track: OSM's crossing node gives no road
## direction), red and white, a red lamp that flashes while the booms move and are down. The
## booms swing from upright (0) to across the road (1) as `LevelCrossing` says. Road traffic stops
## at them: `obstacles()` gives the points `CityLife` holds traffic at. The bell has no recording
## yet (counted, not heard). Follows the floating origin.

## Booms stand this far from the track's centre, metres; each is this long (half a two-lane road).
const SET_BACK := 5.5
const BOOM := 4.6
const POST := Color(0.25, 0.25, 0.27)

var crossing: RailNetwork.Crossing
var amount: float = 0.0
var _booms: Array[Node3D] = []
var _lamps: Array[MeshInstance3D] = []


static func make(c: RailNetwork.Crossing, materials: RailMaterials) -> CrossingView:
	var v := CrossingView.new()
	v.crossing = c
	v.name = "Crossing_%s" % c.id
	v.add_to_group(WorldOrigin.GROUP)
	v._build(materials)
	return v


func _enter_tree() -> void:
	position = WorldOrigin.to_scene(Vector2(crossing.x, crossing.z))


func _build(materials: RailMaterials) -> void:
	# The track runs along yaw; the road square to it.
	rotation.y = crossing.yaw
	for side: float in [-1.0, 1.0]:
		# Post at the road's edge (left of the road on each approach), the boom pivoting on it.
		# Local -Z runs along the track (the node is turned to its yaw), local X along the road.
		var post := Vector3(side * SET_BACK, 0.0, side * 4.2)
		var mb := MeshBuilder.new()
		RailGeometry._box(mb, post + Vector3(0, 0.6, 0), Vector3(0.18, 0.6, 0.18), 0.0, POST)
		var base := MeshInstance3D.new()
		base.mesh = mb.commit(materials.track)
		base.visibility_range_end = 260.0
		add_child(base)
		var pivot := Node3D.new()
		pivot.position = post + Vector3(0, 1.05, 0)
		add_child(pivot)
		var boom := MeshBuilder.new()
		var n := 6
		for k in n:
			var c := Color(0.85, 0.12, 0.1) if k % 2 == 0 else Color(0.95, 0.95, 0.92)
			var z0 := -side * BOOM * float(k) / n
			var z1 := -side * BOOM * float(k + 1) / n
			RailGeometry._box(boom, Vector3(0, 0, (z0 + z1) / 2.0), Vector3(0.06, 0.06, absf(z1 - z0) / 2.0), 0.0, c)
		var bm := MeshInstance3D.new()
		bm.mesh = boom.commit(materials.track)
		bm.visibility_range_end = 260.0
		pivot.add_child(bm)
		_booms.append(pivot)
		var lamp := MeshInstance3D.new()
		var sphere := SphereMesh.new()
		sphere.radius = 0.12
		sphere.height = 0.24
		sphere.radial_segments = 8
		sphere.rings = 4
		lamp.mesh = sphere
		var m := StandardMaterial3D.new()
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		m.albedo_color = Color(1, 0.12, 0.08)
		lamp.material_override = m
		lamp.position = post + Vector3(0, 1.5, 0)
		lamp.visible = false
		add_child(lamp)
		_lamps.append(lamp)
	set_amount(0.0, 0.0)


## Booms at `a` (0 up … 1 down); the lamps flash once a second while not fully up.
func set_amount(a: float, clock: float) -> void:
	amount = a
	for i in _booms.size():
		var side := -1.0 if i == 0 else 1.0
		# Upright is a quarter turn about the road's direction (local x).
		_booms[i].rotation = Vector3(side * (1.0 - a) * PI / 2.0, 0, 0)
	var lit := a > 0.0 and fposmod(clock, 1.0) < 0.5
	for l in _lamps:
		l.visible = lit


## Points across the road at both booms, world metres (x, z, radius), while not fully up.
func obstacles() -> PackedVector3Array:
	var out := PackedVector3Array()
	if amount <= 0.0:
		return out
	var along := Vector2(-sin(crossing.yaw), -cos(crossing.yaw))
	var across := Vector2(along.y, -along.x)
	for side: float in [-1.0, 1.0]:
		for k in 5:
			var w := -4.0 + 2.0 * k
			var p := Vector2(crossing.x, crossing.z) + across * (side * SET_BACK) + along * w
			out.append(Vector3(p.x, p.y, 1.1))
	return out
