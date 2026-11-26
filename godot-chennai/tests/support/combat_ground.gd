class_name CombatGround
extends MissionsGround
## `MissionsGround` with the fight wired in (`CombatWiring`, G-410…G-429) and a 40 km flat
## ground (a slab with its top at y 0), so every stage's fight can be played where the content
## puts it, kilometres from the origin. No city and no street life: the rules' rays see open
## ground, the police drive straight (or on a test's own road graph), no figures are loaded
## unless `models` is true. Not a test file.

var combat: CombatWiring


static func make_fight(save_path: String, weapons_path: String, models: bool = false) -> CombatGround:
	var g := CombatGround.new()
	g.name = "CombatGround"
	g._build(save_path)
	var plane := StaticBody3D.new()
	plane.name = "Plane"
	plane.collision_layer = PhysicsLayers.WORLD
	var cs := CollisionShape3D.new()
	# A 40 km slab (Jolt's world boundary plane is only 2 km across).
	var slab := BoxShape3D.new()
	slab.size = Vector3(40000.0, 1.0, 40000.0)
	cs.shape = slab
	cs.position = Vector3(0, -0.5, 0)
	plane.add_child(cs)
	g.add_child(plane)
	DirAccess.remove_absolute(ProjectSettings.globalize_path(weapons_path))
	g._weapons = weapons_path
	g._models = models
	return g


var _weapons := ""
var _models := false


## After the ground is in the tree (the missions' session exists then): the fight and its loading.
func ready_fight() -> String:
	combat = CombatWiring.make(null, rig, driving, layer, null, _weapons)
	combat.load_models = _models
	add_child(combat)
	return await combat.prepare()


## Jump to the start of stage `id` (every stage before it completed), with `money`.
func to_stage(id: String, money: int = 0) -> void:
	var s := layer.session
	var done: Array[String] = []
	for m: MissionData.Mission in s.content.missions:
		if m.id == id:
			break
		done.append(m.id)
	s.store.set_section(SaveStore.PROGRESS, {"completed": done, "money": money})
	s.store.write()
	s.reload()


## The player on foot at (x, z) facing `yaw`.
func put(x: float, z: float, yaw: float = 0.0) -> void:
	rig.place(Vector3(x, 0.05, z), yaw)
