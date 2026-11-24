class_name VehicleSounds
extends Node
## Composition glue from `Driving` (vehicles) to the `Sound` autoload (audio), so neither knows the
## other (decision G-113, the Sound agent's "How other agents call it"): the engine every
## physics step while driving (speed and accelerator), off when the player gets out or is
## thrown; the horn (the siren on vehicles with one); a door or seat sound when a door shuts or
## the rider sits on an open seat; the crash thump by impact; tyre squeal from the sideways
## slide; the place's enclosure (a closed car or bus muffles the street).

## Sideways speed (m/s) that counts as a full slide for the squeal.
const FULL_SLIDE := 6.0

var driving: Driving
## The sound system to drive (the `Sound` autoload unless a test gives its own).
var sound: SoundSystem = null


static func wire(d: Driving, system: SoundSystem = null) -> VehicleSounds:
	var s := VehicleSounds.new()
	s.name = "VehicleSounds"
	s.driving = d
	s.sound = system
	d.horn.connect(s._on_horn)
	d.boarding_event.connect(s._on_boarding)
	d.crashed.connect(s._on_crashed)
	d.mode_changed.connect(s._on_mode)
	return s


func _ready() -> void:
	if sound == null:
		sound = get_node_or_null(^"/root/Sound") as SoundSystem
	process_physics_priority = 10  # after `Driving` and the vehicle step


## The `SoundProfiles` name of a vehicle (variant ids, with the race car's kind).
static func kind_of(v: Vehicle) -> String:
	if v.variant.id == &"race_car":
		return "race"
	return String(v.variant.id)


func _physics_process(dt: float) -> void:
	if sound == null or not sound.active:
		return
	var v := driving.vehicle
	if driving.mode() != &"driving" or v == null:
		return
	sound.set_engine(kind_of(v), v.forward_speed(), maxf(0.0, v.throttle), dt)
	var side := v.global_basis.x.dot(v.linear_velocity)
	sound.set_skid(absf(side) / FULL_SLIDE if absf(v.forward_speed()) > 3.0 else 0.0)
	sound.set_place(INF, 0.5, not v.type.open_seat)


func _on_mode(mode: StringName) -> void:
	if sound == null or mode == &"driving":
		return
	sound.engine_off(mode != &"thrown")
	sound.set_skid(0.0)
	sound.set_siren(false)
	sound.set_place(INF, 0.5, false)


func _on_horn(v: Vehicle) -> void:
	if sound == null:
		return
	if v.has_siren():
		sound.set_siren(v.siren())
	else:
		sound.horn(kind_of(v))


func _on_boarding(v: Vehicle, event: StringName) -> void:
	if sound == null:
		return
	# A door shutting, or settling on an open seat (bikes and autos have no door to shut).
	if event == &"shut" or (event == &"seated" and v.type.entry.door == "none"):
		sound.door(kind_of(v))


func _on_crashed(_v: Vehicle, outcome: CrashRules.Outcome) -> void:
	if sound != null:
		sound.crash(outcome.impact_kmh / 3.6)
