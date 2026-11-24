class_name DetailModels
extends RefCounted
## The small models of the mapped street objects (G-191): bench, waste basket, drinking-water
## stand, post box, public toilet, power pole and tower, bollard, gate, bus-stop pole. Procedural
## boxes (vertex colours, the `objects` material), a few dozen triangles each, built once and
## copied where OSM maps one. Sizes are estimated. Open front towards -Z, like the shelter.

const HALF: Dictionary[StringName, Vector3] = {
	&"bench": Vector3(0.9, 0.45, 0.28),
	&"waste_basket": Vector3(0.22, 0.4, 0.22),
	&"drinking_water": Vector3(0.25, 0.5, 0.25),
	&"post_box": Vector3(0.28, 0.65, 0.28),
	&"toilets": Vector3(1.3, 1.25, 1.2),
	&"power_pole": Vector3(0.12, 4.25, 0.12),
	&"power_tower": Vector3(1.4, 9.0, 1.4),
	&"bollard": Vector3(0.1, 0.4, 0.1),
	&"gate": Vector3(1.7, 0.75, 0.1),
	&"stop_pole": Vector3(0.08, 1.4, 0.08),
}
## Which of them block walking (a collider box of `HALF` size).
const SOLID: PackedStringArray = ["toilets", "power_pole", "power_tower", "bollard", "post_box", "drinking_water"]

var models: Dictionary[StringName, MeshBuilder] = {}


static func create() -> DetailModels:
	var m := DetailModels.new()
	for k: StringName in HALF:
		m.models[k] = MeshBuilder.new()
	m._bench(m.models[&"bench"])
	m._basket(m.models[&"waste_basket"])
	m._water(m.models[&"drinking_water"])
	m._post_box(m.models[&"post_box"])
	m._toilets(m.models[&"toilets"])
	m._pole(m.models[&"power_pole"])
	m._tower(m.models[&"power_tower"])
	m._bollard(m.models[&"bollard"])
	m._gate(m.models[&"gate"])
	m._stop_pole(m.models[&"stop_pole"])
	return m


func triangles(kind: StringName) -> int:
	var b: MeshBuilder = models.get(kind)
	return b.triangle_count() if b != null else 0


func _bench(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.9, 0.4, -0.22), Vector3(0.9, 0.46, 0.2), 0x8a6a45)
	CityModels.box(b, Vector3(-0.9, 0.5, 0.18), Vector3(0.9, 0.88, 0.24), 0x8a6a45)
	for x: float in [-0.75, 0.75]:
		CityModels.box(b, Vector3(x - 0.05, 0, -0.2), Vector3(x + 0.05, 0.4, 0.2), 0x77797a)


func _basket(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.2, 0.0, -0.2), Vector3(0.2, 0.7, 0.2), 0x3f7a4a, 0.03)
	CityModels.box(b, Vector3(-0.22, 0.7, -0.22), Vector3(0.22, 0.76, 0.22), 0x2b2f2c)


func _water(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.22, 0.0, -0.22), Vector3(0.22, 0.85, 0.22), 0x7f8a92, 0.04)
	CityModels.box(b, Vector3(-0.1, 0.85, -0.3), Vector3(0.1, 0.95, 0.1), 0x2f6f9f)


func _post_box(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.25, 0.0, -0.25), Vector3(0.25, 1.15, 0.25), 0xb3281f, 0.02)
	CityModels.box(b, Vector3(-0.27, 1.15, -0.27), Vector3(0.27, 1.3, 0.27), 0x8e1f18)
	CityModels.box(b, Vector3(-0.12, 0.8, -0.26), Vector3(0.12, 0.88, -0.24), 0x1b1b1b)


func _toilets(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-1.3, 0.0, -1.2), Vector3(1.3, 2.4, 1.2), 0xd8d2c0)
	CityModels.box(b, Vector3(-1.4, 2.4, -1.3), Vector3(1.4, 2.5, 1.3), 0x6a6e70)
	CityModels.box(b, Vector3(-0.9, 0.0, -1.22), Vector3(-0.2, 2.05, -1.2), 0x3b6a8a)
	CityModels.box(b, Vector3(0.2, 0.0, -1.22), Vector3(0.9, 2.05, -1.2), 0x3b6a8a)


func _pole(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.11, 0, -0.11), Vector3(0.11, 8.4, 0.11), 0x9a968c, 0.04)
	CityModels.box(b, Vector3(-0.7, 7.7, -0.05), Vector3(0.7, 7.82, 0.05), 0x5a4a3a)
	for x: float in [-0.6, 0.0, 0.6]:
		CityModels.box(b, Vector3(x - 0.04, 7.82, -0.04), Vector3(x + 0.04, 7.98, 0.04), 0xd8d4c8)


## A lattice-ish transmission tower: four legs in three stepped sections, rings and two arms.
func _tower(b: MeshBuilder) -> void:
	var spread := [1.3, 1.0, 0.7]
	for s in 3:
		var y0 := s * 6.0
		var w: float = spread[s]
		for sx: float in [-1.0, 1.0]:
			for sz: float in [-1.0, 1.0]:
				CityModels.box(b, Vector3(sx * w - 0.08, y0, sz * w - 0.08), Vector3(sx * w + 0.08, y0 + 6.0, sz * w + 0.08), 0x8c9399)
		for y: float in [y0 + 3.0, y0 + 6.0]:
			CityModels.box(b, Vector3(-w, y - 0.04, -w - 0.04), Vector3(w, y + 0.04, -w + 0.04), 0x8c9399)
			CityModels.box(b, Vector3(-w, y - 0.04, w - 0.04), Vector3(w, y + 0.04, w + 0.04), 0x8c9399)
			CityModels.box(b, Vector3(-w - 0.04, y - 0.04, -w), Vector3(-w + 0.04, y + 0.04, w), 0x8c9399)
			CityModels.box(b, Vector3(w - 0.04, y - 0.04, -w), Vector3(w + 0.04, y + 0.04, w), 0x8c9399)
	CityModels.box(b, Vector3(-4.0, 15.0, -0.1), Vector3(4.0, 15.2, 0.1), 0x8c9399)
	CityModels.box(b, Vector3(-3.0, 17.0, -0.1), Vector3(3.0, 17.2, 0.1), 0x8c9399)
	for x: float in [-3.8, 3.8, -2.8, 2.8]:
		CityModels.box(b, Vector3(x - 0.05, 14.4, -0.05), Vector3(x + 0.05, 15.0, 0.05), 0xd8d4c8)


func _bollard(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.09, 0.0, -0.09), Vector3(0.09, 0.8, 0.09), 0xeeeeea, 0.01)
	CityModels.box(b, Vector3(-0.092, 0.5, -0.092), Vector3(0.092, 0.6, 0.092), 0x1b1b1b)


func _gate(b: MeshBuilder) -> void:
	for x: float in [-1.6, 1.6]:
		CityModels.box(b, Vector3(x - 0.1, 0.0, -0.1), Vector3(x + 0.1, 1.5, 0.1), 0x4d5156)
	CityModels.box(b, Vector3(-1.5, 0.15, -0.04), Vector3(1.5, 0.25, 0.04), 0x5a5f63)
	CityModels.box(b, Vector3(-1.5, 0.7, -0.04), Vector3(1.5, 0.8, 0.04), 0x5a5f63)
	CityModels.box(b, Vector3(-1.5, 1.2, -0.04), Vector3(1.5, 1.3, 0.04), 0x5a5f63)
	for x: float in [-1.0, 0.0, 1.0]:
		CityModels.box(b, Vector3(x - 0.03, 0.15, -0.03), Vector3(x + 0.03, 1.3, 0.03), 0x5a5f63)


func _stop_pole(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.05, 0.0, -0.05), Vector3(0.05, 2.8, 0.05), 0x55595c)
	CityModels.box(b, Vector3(-0.3, 2.35, -0.09), Vector3(0.3, 2.8, -0.05), 0x1f5aa6)
	CityModels.box(b, Vector3(-0.26, 2.52, -0.095), Vector3(0.26, 2.6, -0.09), 0xf4f4ee)
