class_name RailwayWiring
extends RefCounted
## Connects the railway to the rest of the game (composition root glue, G-333): its HUD on its own
## canvas layer, the player's money for tickets (the mission session's balance, saved), the hour,
## the ACTION button's BOARD THE TRAIN, the platform people drawn by `CityLife`'s figures and the
## crossings that stop its traffic, and the walking controls hidden while riding or driving.

## The HUD's canvas layer, above the city's HUD and under the pause menu.
const LAYER := 6


static func wire(main: Main, railway: Railway) -> void:
	var layer := CanvasLayer.new()
	layer.name = "RailLayer"
	layer.layer = LAYER
	var hud := RailHud.new()
	layer.add_child(hud)
	main.add_child(layer)
	railway.set_hud(hud)
	railway.set_meta(&"layer", layer)
	railway.hour_of = func() -> float: return GameLoop.clock.hour
	var missions := main.find_child("MissionsLayer", false, false) as MissionsLayer
	if missions != null:
		railway.money_of = func() -> int: return missions.session.runner.balance() if missions.session != null else 0
		railway.charge = func(rupees: int) -> void:
			if missions.session != null:
				missions.session.runner.charge(rupees)
				missions.session.save()
	var rig := main.rig
	if rig != null:
		rig.controls.action_context.add_source(railway.offer)
	if main.life != null:
		main.life.extra_obstacles = railway.crossing_obstacles
		main.life.extra_people = railway.crowd_people
	railway.state_changed.connect(func(_s: StringName) -> void: set_active(railway, rig, main.state == &"play"))
	set_active(railway, rig, main.state == &"play")


## Shows the railway HUD in play; the walking controls only while on foot.
static func set_active(railway: Railway, rig: PlayerRig, on: bool) -> void:
	var layer := railway.get_meta(&"layer", null) as CanvasLayer
	if layer != null:
		layer.visible = on
	if rig != null and railway.state != &"foot":
		rig.controls.visible = false
		rig.reads_devices = false
	elif rig != null and on:
		rig.reads_devices = true
		rig.controls.visible = rig.body.is_on_foot()
