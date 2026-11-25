class_name ArmsWiring
extends Node3D
## The game side of weapons and gangs (port of `apps/game/src/Arms.ts`, G-417): weapons lying in
## the world (a glowing ring with the weapon turning above it, taken by walking over it on foot,
## back after `WeaponPickups.PICKUP_RESPAWN`), the gang crews put on their corners near the player
## (`Gangs.crews_to_field`, at most `max_crews`: quality presets give Low one), a stage's weapon
## rewards, the weapon button's cycle, and the arsenal saved in its own file (`cow-weapons-v1`'s
## shape). The rules are `Weapons`, `Arsenal`, `WeaponPickups`, `Gangs`; this connects them.

const DEFAULT_SAVE := "user://chennai-weapons-v1.json"
## Pickups further than this are not drawn, metres.
const PICKUP_DRAW := 120.0
## Crews are kept off corners this close to the current objective: the stage has its own people.
const STAGE_CLEAR := 150.0

signal notice(title: String, detail: String, seconds: float)

var combat: Combat
var content: GameContent
var pickups: WeaponPickups
var save_path := DEFAULT_SAVE
var max_crews: int = int(Gangs.GANG_RULES["max_crews"])
## Crews out now (id -> true) and regrouping after being beaten (id -> seconds left).
var out: Dictionary[String, bool] = {}
var regrouping: Dictionary[String, float] = {}
var _views: Dictionary[String, Node3D] = {}
var _spin := 0.0
var _ring_mesh: TorusMesh = null


static func make(rules: Combat, game: GameContent, path: String = DEFAULT_SAVE) -> ArmsWiring:
	var a := ArmsWiring.new()
	a.name = "Arms"
	a.combat = rules
	a.content = game
	a.save_path = path
	a.pickups = WeaponPickups.new(game.pickups)
	a.load_saved()
	return a


func _ready() -> void:
	_ring_mesh = TorusMesh.new()
	_ring_mesh.inner_radius = 0.55
	_ring_mesh.outer_radius = 0.8
	_ring_mesh.rings = 24
	_ring_mesh.ring_segments = 4
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color(0.35, 0.88, 1.0, 0.75)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_ring_mesh.material = mat
	for spot: Dictionary in content.pickups:
		var v := Node3D.new()
		v.name = "Pickup_%s" % str(spot["id"]).replace("-", "_")
		var ring := MeshInstance3D.new()
		ring.mesh = _ring_mesh
		ring.scale = Vector3(1, 0.08, 1)
		ring.position.y = 0.06
		ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		v.add_child(ring)
		var pivot := Node3D.new()
		pivot.name = "Weapon"
		pivot.position.y = 0.85
		v.add_child(pivot)
		CombatFx.hold(pivot, StringName(str(spot["weapon"])))
		v.visible = false
		add_child(v)
		_views[str(spot["id"])] = v


# --- Saving ---------------------------------------------------------------------------------

func load_saved() -> void:
	var text := FileAccess.get_file_as_string(save_path) if FileAccess.file_exists(save_path) else ""
	var data: Variant = JSON.parse_string(text) if text != "" else null
	combat.arsenal.load_save(data)


func save() -> void:
	var f := FileAccess.open(save_path, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(combat.arsenal.save()))


## Busted: every weapon and round is taken (fists and an empty pistol), and saved.
func confiscate() -> void:
	combat.arsenal.reset()
	save()


## New game: fists and an empty pistol, every pickup back, no crews out.
func reset() -> void:
	combat.arsenal.reset()
	pickups.reset()
	out.clear()
	regrouping.clear()
	save()


# --- Each step ------------------------------------------------------------------------------

## The weapon button: the next gun.
func switch_weapon() -> void:
	var gun := combat.arsenal.cycle()
	notice.emit(str(Weapons.spec(gun)["name"]), "%d rounds" % combat.arsenal.ammo_of(gun), 1.2)
	save()


## Crews onto their corners near the player and far ones away; pickups walked over taken. Returns
## the crew groups on the street now. `objective`: {x, z} of the stage objective, or {}.
func step(dt: float, at: Vector2, on_foot: bool, objective: Dictionary) -> Array[String]:
	for id: String in regrouping.keys():
		var left: float = regrouping[id] - dt
		if left <= 0.0:
			regrouping.erase(id)
		else:
			regrouping[id] = left
	# A crew the rules removed (knocked out, a new game) is no longer out.
	for id: String in out.keys():
		var still := false
		for e in combat.enemies:
			if e.group == id:
				still = true
				break
		if not still:
			out.erase(id)
	var blocked: Dictionary = {}
	for id: String in regrouping:
		blocked[id] = true
	if not objective.is_empty():
		for c: Dictionary in content.crews:
			if Vector2(float(c["x"]), float(c["z"])).distance_to(Vector2(float(objective["x"]), float(objective["z"]))) < STAGE_CLEAR:
				blocked[str(c["id"])] = true
	var wanted := Gangs.crews_to_field(content.crews, at.x, at.y, out, blocked, max_crews)
	for id: String in out.keys():
		if not wanted.has(id):
			combat.remove_group(id)
			out.erase(id)
	for c: Dictionary in content.crews:
		var id := str(c["id"])
		if not wanted.has(id) or out.has(id):
			continue
		var spots: Array = []
		for m: Dictionary in c["members"]:
			spots.append(EnemySpot.from_dict(m))
		combat.remove_group(id)
		combat.spawn_group(id, spots)
		out[id] = true
	for spot in pickups.update(dt, at.x, at.y, on_foot):
		var weapon := str(spot["weapon"])
		var added := combat.arsenal.give(weapon, int(spot.get("ammo", -1)))
		var w := Weapons.spec(weapon)
		if w["kind"] == "gun":
			combat.arsenal.select(weapon)
		notice.emit("Picked up: %s" % w["name"], "+%d rounds · %d carried" % [added, combat.arsenal.ammo_of(weapon)] if w["kind"] == "gun" else "HIT swings it", 2.5)
		save()
	var ids: Array[String] = []
	for id: String in out:
		ids.append(id)
	return ids


## React to combat: beaten crews regroup; warnings and provocations get a message.
func handle(events: Array[Dictionary]) -> void:
	for e in events:
		var group := str(e.get("group", ""))
		if group == "":
			continue
		var crew := _crew(group)
		if crew.is_empty():
			continue
		var gang := _gang(str(crew["gang"]))
		var name_ := str(gang.get("name", "The gang"))
		match str(e["type"]):
			"groupCleared":
				out.erase(group)
				regrouping[group] = float(Gangs.GANG_RULES["regroup_time"])
				notice.emit("%s crew beaten" % name_, "Their corner is quiet for now.", 3.0)
			"crewWarning":
				notice.emit("%s turf" % name_, "They don't like your weapon on their corner. Move on.", 2.6)
			"crewProvoked":
				notice.emit("%s are after you" % name_, "%s of %s" % [gang.get("meaning", ""), gang.get("district", "")] if not gang.is_empty() else "", 2.6)


func _crew(id: String) -> Dictionary:
	for c: Dictionary in content.crews:
		if str(c["id"]) == id:
			return c
	return {}


func _gang(id: String) -> Dictionary:
	for g: Dictionary in content.gangs:
		if str(g["id"]) == id:
			return g
	return {}


## A stage finished: its weapons. Returns a line for the message (" · Shotgun +14"), or "".
func reward(m: MissionData.Mission) -> String:
	if m == null or m.weapons.is_empty():
		return ""
	var lines := PackedStringArray()
	for w: Dictionary in m.weapons:
		var id := str(w["id"])
		if not Weapons.is_weapon(id):
			continue
		var ammo := int(w.get("ammo", 0))
		combat.arsenal.give(id, ammo)
		lines.append("%s%s" % [Weapons.spec(id)["name"], " +%d" % ammo if ammo > 0 else ""])
	save()
	return " · ".join(lines)


## The weapon to show in the hand: the gun in hand when loaded, else the bat if owned, else "".
func shown(swinging: bool) -> String:
	var a := combat.arsenal
	var gun := str(a.gun()["id"])
	if swinging and a.has("bat"):
		return "bat"
	if Weapons.is_gun(gun) and a.ammo_of(gun) > 0:
		return gun
	return "bat" if a.has("bat") else ""


## A weapon in hand (gang members don't like it).
func armed() -> bool:
	return shown(false) != ""


## Each frame: the pickups near the player turn and bob.
func draw(dt: float, at: Vector2) -> void:
	_spin += dt
	for spot: Dictionary in content.pickups:
		var id := str(spot["id"])
		var v: Node3D = _views.get(id)
		if v == null:
			continue
		var p := Vector2(float(spot["x"]), float(spot["z"]))
		v.visible = pickups.available(id) and p.distance_to(at) < PICKUP_DRAW
		if v.visible:
			v.position = WorldOrigin.to_scene_xz(p.x, p.y, 0.0)
			var w := v.get_child(1) as Node3D
			w.rotation.y = _spin * 1.6
			w.position.y = 0.85 + sin(_spin * 2.4) * 0.08


func pickup_views_shown() -> int:
	var n := 0
	for id: String in _views:
		if _views[id].visible:
			n += 1
	return n
