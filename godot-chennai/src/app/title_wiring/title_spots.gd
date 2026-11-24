class_name TitleSpots
extends RefCounted
## The places the title camera drifts over (G-164): Marina, T. Nagar and Central, one per launch,
## chosen by a seed. A spot is a camera rig, not a name: the chip shows the real place found in the
## world's own index (`TitlePlace`), never a label written here. Points are world metres
## (+X east, -Z north), headings as in the game (0 looks north, turning left is positive).

class Spot:
	extends RefCounted
	var id: StringName
	## What the camera looks at (world metres).
	var target: Vector2
	## Where it looks from: this far back from the target, this high.
	var heading: float
	var distance: float
	var height: float
	## The slow sweep: this many radians either side of the heading over `period` seconds.
	var sweep: float
	var period: float

	func _init(spot_id: StringName, at: Vector2, yaw: float, back: float, up: float, swing: float = 0.22, seconds: float = 64.0) -> void:
		id = spot_id
		target = at
		heading = yaw
		distance = back
		height = up
		sweep = swing
		period = seconds


## A spot a tool or test puts in place of the three (screenshot trials, tests).
static var forced: Spot = null


static func all() -> Array[Spot]:
	return [
		# From the sand over the beach road towards the streets behind it.
		Spot.new(&"marina", Vector2(7540.0, 3820.0), PI / 2.0, 70.0, 20.0),
		# Over the shopping streets of T. Nagar.
		Spot.new(&"t_nagar", Vector2(2543.0, 5160.0), 0.0, 70.0, 26.0),
		# Over the station and the streets by Chennai Central.
		Spot.new(&"central", Vector2(7113.0, 254.0), 0.0, 70.0, 26.0),
	]


static func by_id(id: StringName) -> Spot:
	if forced != null and forced.id == id:
		return forced
	for s in all():
		if s.id == id:
			return s
	return null


## The spot for a launch's seed: the same seed always gives the same spot.
static func pick(seed_value: int) -> Spot:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var list := all()
	return list[rng.randi_range(0, list.size() - 1)]


## The camera's place for a spot at `t` seconds: {position, target} in world metres, heights in
## metres. The sweep is a sine so the camera eases at both ends (like the prototype's alternate).
static func pose(spot: Spot, t: float, phase: float = 0.0) -> Dictionary:
	var wave := sin(TAU * t / spot.period + phase)
	var yaw := spot.heading + spot.sweep * wave
	var back := spot.distance * (1.0 + 0.05 * sin(TAU * t / (spot.period * 1.7) + phase))
	var forward := Vector2(-sin(yaw), -cos(yaw))
	return {"ground": spot.target - forward * back, "height": spot.height + 1.5 * wave, "target": spot.target, "target_height": 3.0}
