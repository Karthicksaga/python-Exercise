class_name PlayerSounds
extends Node
## The player's own sounds, wired from a `PlayerController` without touching it: footsteps at the
## stride's cadence while walking or running on the ground (wet when it rains), a thud on landing
## (heavier for a longer fall), and the listener following the camera. Add one as a child of the
## player rig (or anywhere) and call `follow(body)`; the composition root does this.

## Rain level above which steps splash.
const WET_FROM := 0.3
## Fall speed (m/s) that makes the heaviest landing thud.
const HARD_LANDING := 12.0

## The sound system to drive (the `Sound` autoload unless a test gives its own).
var sound: SoundSystem = null
var body: PlayerController = null
var _fall_speed: float = 0.0


func follow(player: PlayerController) -> void:
	if body != null and body.landed.is_connected(_on_landed):
		body.landed.disconnect(_on_landed)
	body = player
	body.landed.connect(_on_landed)


func _ready() -> void:
	if sound == null:
		sound = get_node_or_null(^"/root/Sound") as SoundSystem
	process_physics_priority = 10  # after the body has moved this step


func _physics_process(dt: float) -> void:
	if body == null or sound == null or not is_instance_valid(body):
		return
	if body.is_on_foot():
		var weather := get_node_or_null(^"/root/Weather") as WeatherService
		var wet := weather != null and weather.rain_level() > WET_FROM
		# Swimming: the strokes splash like wet steps (G-474).
		sound.walk(dt, body.speed, body.is_on_floor() or body.swimming, wet or body.swimming)
		if not body.is_on_floor() and not body.swimming:
			_fall_speed = maxf(0.0, -body.velocity.y)
	var camera := get_viewport().get_camera_3d()
	if camera != null:
		var forward := -camera.global_basis.z
		sound.set_listener(camera.global_position, atan2(-forward.x, -forward.z))


func _on_landed() -> void:
	if sound != null:
		sound.land(clampf(_fall_speed / HARD_LANDING, 0.0, 1.0))
	_fall_speed = 0.0
