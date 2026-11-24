class_name PlayWiring
extends Node
## Everything the real game adds round the player in the streamed city, wired in one place so
## `Main` stays a composition root that only runs the flow (decisions G-111…G-114):
## - `Driving` with the player as its rider (`PlayerRiderLink`), the touch `DrivingControls` and
##   `DrivingWiring` (ENTER near a vehicle, the driving set, chase camera, speed and gear);
## - `VehicleSounds` (engine, horn, doors, crash, skid) and `PlayerSounds` (footsteps, listener);
## - `EnvironmentWiring` (day and night from `GameLoop.clock`, rain from `Weather`, lamps);
## - `ParkedVehicles` at the Three.js game's parking and the extra spots.
## Add it under the `CityWorld` (so it pauses with the world), then `await prepare(spawn)`.

var world: CityWorld
var rig: PlayerRig
var driving: Driving
var controls: DrivingControls
var wiring: DrivingWiring
var vehicle_sounds: VehicleSounds
var player_sounds: PlayerSounds
var environment: EnvironmentWiring
var parked: ParkedVehicles
var ui: CanvasLayer


static func make(city: CityWorld, player: PlayerRig, content: GameContent) -> PlayWiring:
	var p := PlayWiring.new()
	p.name = "Play"
	p.world = city
	p.rig = player
	p.environment = EnvironmentWiring.wire(city)
	p.add_child(p.environment)
	p.driving = Driving.new()
	p.driving.name = "Driving"
	p.driving.rider = PlayerRiderLink.make(player.body)
	p.driving.reverse_on_hold = true
	p.add_child(p.driving)
	p.ui = CanvasLayer.new()
	p.ui.name = "DrivingUi"
	p.ui.layer = 1
	p.add_child(p.ui)
	p.controls = DrivingControls.new()
	p.ui.add_child(p.controls)
	p.wiring = DrivingWiring.wire(p.driving, p.controls, player)
	p.add_child(p.wiring)
	p.vehicle_sounds = VehicleSounds.wire(p.driving)
	p.add_child(p.vehicle_sounds)
	p.player_sounds = PlayerSounds.new()
	p.player_sounds.name = "PlayerSounds"
	p.player_sounds.follow(player.body)
	p.add_child(p.player_sounds)
	p.parked = ParkedVehicles.make(city, p.driving, ParkingSpots.load_all(content))
	p.add_child(p.parked)
	p.set_active(false)
	return p


## Loading work: the vehicles' models, and the vehicles parked round the start. "" or the error.
func prepare(start: Vector2) -> String:
	return await parked.prepare(start)


## Play (true) or a menu (false): the touch controls, keys and pad.
func set_active(on: bool) -> void:
	ui.visible = on
	driving.reads_devices = on
	if rig != null:
		rig.reads_devices = on
		# The walking controls only on foot (DrivingWiring swaps them while driving).
		rig.controls.visible = on and driving.mode() == &"foot"
