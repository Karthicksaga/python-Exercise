class_name AgentPresets
extends RefCounted
## Settings for the two kinds of agents (port of `ai/src/presets.ts`): Chennai's traffic mix and
## pedestrians on the verges. Footprints are replaced by the vehicle models' own (`Population`).

## Cruising speed by road class, m/s.
const ROAD_SPEED := {&"motorway": 16.0, &"primary": 13.0, &"secondary": 11.0, &"tertiary": 9.0, &"residential": 6.5, &"service": 4.0, &"footway": 3.0}
## Widest a single traffic lane is driven, metres.
const MAX_LANE := 3.5


## One type of agent in a mixed pool.
class Kind:
	extends RefCounted
	var name: StringName = &"default"
	var share: float = 1.0
	var speed_factor: float = 1.0
	var max_speed: float = INF
	var acceleration_factor: float = 1.0
	var half_width: float = 0.35
	var half_length: float = 0.35
	## Gap kept to whatever is in front when stopped, metres.
	var gap: float = 0.9
	## The class of road user: &"car", &"auto", &"bike", &"bus" or &"person" (drivers, carjacking,
	## sound); `name` is the look (a vehicle variant id in `vehicle_types.json` for traffic).
	var group: StringName = &""

	static func make(n: StringName, sh: float, sf: float, ms: float, af: float, hw: float, hl: float, g: float) -> Kind:
		var k := Kind.new()
		k.name = n
		k.share = sh
		k.speed_factor = sf
		k.max_speed = ms
		k.acceleration_factor = af
		k.half_width = hw
		k.half_length = hl
		k.gap = g
		k.group = n
		return k

	## The same kind as another look of its group (footprint replaced later from the model).
	func as_look(look: StringName, sh: float) -> Kind:
		var k := Kind.make(look, sh, speed_factor, max_speed, acceleration_factor, half_width, half_length, gap)
		k.group = group
		return k


class Settings:
	extends RefCounted
	var count: int = 0
	## True for traffic (lanes left of the centre line, junction turns, stops for oncoming);
	## false for pedestrians (on the verge, either side).
	var vehicles: bool = true
	var look_ahead: float = 6.0
	var turn_rate: float = 2.4
	var acceleration: float = 2.6
	var braking: float = 9.0
	var stops_for_oncoming: bool = true
	var takes_turns: bool = true
	var spawn_min: float = 70.0
	var spawn_max: float = 230.0
	var despawn: float = 300.0
	var retire_beyond: float = 70.0
	var kinds: Array[Kind] = []

	## Cruising speed on an edge, m/s (`variation`: a stable 0..1 number per agent).
	func speed(g: RoadGraph, e: int, variation: float) -> float:
		if vehicles:
			return float(ROAD_SPEED.get(g.kind(e), 6.5)) * (0.8 + variation * 0.35)
		return 1.1 + variation * 0.5

	## Metres to the left of the centre line (India drives on the left).
	## Vehicles: the middle of their lane of the lanes going their way (a one-way street uses
	## the whole carriageway); pedestrians: on the verge, on either side.
	func lane(g: RoadGraph, e: int, variation: float) -> float:
		var width := g.edge_width[e]
		if not vehicles:
			return (width / 2.0 + 1.4) * (1.0 if variation < 0.5 else -1.0)
		var n := maxi(1, g.edge_lanes[e])
		var oneway := g.edge_oneway[e] == 1
		var side := width if oneway else width / 2.0
		var lane_w := minf(MAX_LANE, side / n)
		# Lane 0 is the kerb lane; the fastest drivers take the inner ones.
		var k := mini(n - 1, floori(fposmod(variation * 7.31, 1.0) * n))
		var kerb := width / 2.0 if oneway else side
		# A narrow two-way street is driven near its middle, as the Three.js game did.
		if not oneway and n == 1:
			return minf(width / 4.0, 2.6)
		return kerb - lane_w * (k + 0.5)


## Chennai's mix: two-wheelers and cars, plenty of autos, the odd bus (estimates; the game takes
## the real footprints from the vehicle manifests).
static func traffic_kinds() -> Array[Kind]:
	return [
		Kind.make(&"car", 0.35, 1.0, 16.0, 1.0, 0.82, 1.95, 1.8),
		Kind.make(&"bike", 0.3, 1.12, 15.0, 1.25, 0.32, 1.0, 1.2),
		Kind.make(&"auto", 0.25, 0.82, 11.0, 0.8, 0.66, 1.3, 1.4),
		Kind.make(&"bus", 0.1, 0.78, 11.0, 0.55, 1.25, 5.0, 2.5),
	]


## Chennai's traffic by look (G-124): the Tamil Nadu road vehicles and, rarely, the premium cars
## (brief §11: about 3 in 100). Two-wheelers and autos dominate as on the city's roads; shares
## are estimates of what is seen on an arterial, not counts. Names are vehicle variants.
static func chennai_mix() -> Array[Kind]:
	var base := traffic_kinds()
	var car := base[0]
	var bike := base[1]
	var auto := base[2]
	var bus := base[3]
	return [
		bike.as_look(&"motorbike", 0.34),
		auto.as_look(&"auto", 0.15),
		auto.as_look(&"share_auto", 0.04),
		car.as_look(&"hatchback", 0.17),
		car.as_look(&"sedan", 0.09),
		car.as_look(&"taxi", 0.06),
		car.as_look(&"goods_carrier", 0.04),
		car.as_look(&"suv", 0.015),
		car.as_look(&"saloon", 0.01),
		car.as_look(&"coupe", 0.005),
		bus.as_look(&"bus", 0.045),
		bus.as_look(&"bus_lowfloor", 0.02),
		bus.as_look(&"bus_mofussil", 0.015),
	]


static func traffic(count: int, mix: Array[Kind] = []) -> Settings:
	var s := Settings.new()
	s.count = count
	s.vehicles = true
	s.kinds = mix if not mix.is_empty() else traffic_kinds()
	return s


static func pedestrians(count: int) -> Settings:
	var s := Settings.new()
	s.count = count
	s.vehicles = false
	s.look_ahead = 2.5
	s.turn_rate = 4.5
	s.acceleration = 3.0
	s.braking = 6.0
	s.stops_for_oncoming = false
	s.takes_turns = false
	s.spawn_min = 25.0
	s.spawn_max = 120.0
	s.despawn = 160.0
	s.retire_beyond = 90.0
	s.kinds = [Kind.make(&"person", 1.0, 1.0, INF, 1.0, 0.35, 0.35, 0.9)]
	return s
