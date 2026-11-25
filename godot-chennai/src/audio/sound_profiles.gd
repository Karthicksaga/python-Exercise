class_name SoundProfiles
extends RefCounted
## The sound design as data and pure maths (TD-26 of the Three.js game, `profiles.ts`): how each
## vehicle kind's engine runs and its horn is pitched, and the rules that turn game state (speed,
## gear, accelerator, positions, the hour) into what is heard. No nodes here, so all of it is
## unit-tested; `EngineVoice`, `Ambience` and the `Sound` autoload play it.
##
## Engines are modelled on Chennai's streets (estimated, not measured):
## car: 1.2 L four-cylinder petrol hatchback; premium: a V8 saloon/SUV; race: a high-revving
## four; auto: single-cylinder four-stroke three-wheeler (the share auto too); bike: a 150 cc single;
## thumper: a 350 cc long-stroke single; bus: six-cylinder diesel with a turbo; ambulance:
## four-cylinder diesel van; goods: the small goods carrier, a two-cylinder diesel (G-373).
## The pitch that matters is the firing frequency: rpm / 60 × cylinders / 2 for a four-stroke.

const KINDS: PackedStringArray = ["car", "premium", "race", "auto", "bike", "thumper", "bus", "ambulance", "goods"]

## Engine profiles. Keys as in `profiles.ts` (snake_case), plus the new kinds.
## wave: "saw" (buzzy, full) or "square" (hollow, putt-like). cutoff: [idle, full] low-pass Hz.
const ENGINES: Dictionary = {
	"car": {"cylinders": 4, "strokes": 4, "idle_rpm": 800.0, "shift_rpm": 3400.0, "free_rev": 0.55, "gears": 5, "top_speed": 23.0,
		"wave": "saw", "sub": 0.35, "exhaust_hz": 170.0, "exhaust_q": 1.4, "cutoff": [420.0, 1700.0],
		"roughness": 0.06, "rough_hz": 700.0, "lope": 0.02, "turbo": 0.0, "wind": 0.45, "volume": 0.9},
	"premium": {"cylinders": 8, "strokes": 4, "idle_rpm": 650.0, "shift_rpm": 5200.0, "free_rev": 0.6, "gears": 6, "top_speed": 32.0,
		"wave": "saw", "sub": 0.5, "exhaust_hz": 120.0, "exhaust_q": 1.2, "cutoff": [300.0, 1500.0],
		"roughness": 0.04, "rough_hz": 600.0, "lope": 0.03, "turbo": 0.0, "wind": 0.35, "volume": 0.9},
	"race": {"cylinders": 4, "strokes": 4, "idle_rpm": 1100.0, "shift_rpm": 7800.0, "free_rev": 0.8, "gears": 6, "top_speed": 45.0,
		"wave": "saw", "sub": 0.25, "exhaust_hz": 320.0, "exhaust_q": 2.0, "cutoff": [700.0, 4200.0],
		"roughness": 0.15, "rough_hz": 1200.0, "lope": 0.05, "turbo": 0.0, "wind": 0.6, "volume": 0.95},
	"auto": {"cylinders": 1, "strokes": 4, "idle_rpm": 1350.0, "shift_rpm": 4600.0, "free_rev": 0.6, "gears": 4, "top_speed": 14.0,
		"wave": "square", "sub": 0.0, "exhaust_hz": 330.0, "exhaust_q": 3.0, "cutoff": [900.0, 2600.0],
		"roughness": 0.6, "rough_hz": 2400.0, "lope": 0.28, "turbo": 0.0, "wind": 0.75, "volume": 0.8},
	"bike": {"cylinders": 1, "strokes": 4, "idle_rpm": 1600.0, "shift_rpm": 7600.0, "free_rev": 0.75, "gears": 5, "top_speed": 26.0,
		"wave": "saw", "sub": 0.2, "exhaust_hz": 250.0, "exhaust_q": 2.6, "cutoff": [750.0, 3200.0],
		"roughness": 0.38, "rough_hz": 900.0, "lope": 0.18, "turbo": 0.0, "wind": 1.0, "volume": 0.85},
	"thumper": {"cylinders": 1, "strokes": 4, "idle_rpm": 1000.0, "shift_rpm": 5400.0, "free_rev": 0.6, "gears": 5, "top_speed": 30.0,
		"wave": "square", "sub": 0.4, "exhaust_hz": 120.0, "exhaust_q": 2.0, "cutoff": [400.0, 1600.0],
		"roughness": 0.45, "rough_hz": 500.0, "lope": 0.3, "turbo": 0.0, "wind": 1.0, "volume": 0.95},
	"bus": {"cylinders": 6, "strokes": 4, "idle_rpm": 650.0, "shift_rpm": 2000.0, "free_rev": 0.5, "gears": 5, "top_speed": 17.0,
		"wave": "saw", "sub": 0.6, "exhaust_hz": 110.0, "exhaust_q": 1.2, "cutoff": [260.0, 950.0],
		"roughness": 0.32, "rough_hz": 1800.0, "lope": 0.0, "turbo": 0.5, "wind": 0.3, "volume": 1.15},
	"ambulance": {"cylinders": 4, "strokes": 4, "idle_rpm": 680.0, "shift_rpm": 2600.0, "free_rev": 0.55, "gears": 5, "top_speed": 25.0,
		"wave": "saw", "sub": 0.45, "exhaust_hz": 140.0, "exhaust_q": 1.3, "cutoff": [330.0, 1300.0],
		"roughness": 0.2, "rough_hz": 1500.0, "lope": 0.01, "turbo": 0.25, "wind": 0.4, "volume": 0.95},
	"goods": {"cylinders": 2, "strokes": 4, "idle_rpm": 900.0, "shift_rpm": 3200.0, "free_rev": 0.5, "gears": 5, "top_speed": 19.0,
		"wave": "saw", "sub": 0.5, "exhaust_hz": 130.0, "exhaust_q": 1.4, "cutoff": [350.0, 1200.0],
		"roughness": 0.35, "rough_hz": 1000.0, "lope": 0.12, "turbo": 0.0, "wind": 0.5, "volume": 1.0},
}

## Horns: notes {hz, at (s from the press), length (s)}; wave; band-pass colour; diaphragm buzz Hz;
## attack s (an air horn swells); scoop (start pitch share: air horns start flat).
const HORNS: Dictionary = {
	# Twin disc horns a major third apart: the hatchback "meh-meep".
	"car": {"notes": [[415.0, 0.0, 0.42], [523.0, 0.0, 0.42]], "wave": "square", "colour_hz": 1700.0, "colour_q": 1.1, "buzz": 0.0, "attack": 0.01, "scoop": 1.0, "volume": 0.13},
	# A deeper, smoother twin horn a major third apart (saloons and SUVs).
	"premium": {"notes": [[370.0, 0.0, 0.5], [466.0, 0.0, 0.5]], "wave": "square", "colour_hz": 1400.0, "colour_q": 1.0, "buzz": 0.0, "attack": 0.012, "scoop": 1.0, "volume": 0.13},
	# One short sharp note.
	"race": {"notes": [[600.0, 0.0, 0.25]], "wave": "square", "colour_hz": 2400.0, "colour_q": 1.4, "buzz": 0.0, "attack": 0.006, "scoop": 1.0, "volume": 0.18},
	# A cheap buzzy electric horn, high and thin, tapped twice: "pee-peep".
	"auto": {"notes": [[680.0, 0.0, 0.12], [680.0, 0.19, 0.2]], "wave": "square", "colour_hz": 2600.0, "colour_q": 2.2, "buzz": 34.0, "attack": 0.005, "scoop": 1.0, "volume": 0.3},
	# One small disc horn, higher and shorter than a car's.
	"bike": {"notes": [[560.0, 0.0, 0.3]], "wave": "square", "colour_hz": 2300.0, "colour_q": 1.6, "buzz": 0.0, "attack": 0.008, "scoop": 1.0, "volume": 0.2},
	# A bigger bike's lower, longer single note.
	"thumper": {"notes": [[470.0, 0.0, 0.36]], "wave": "square", "colour_hz": 1900.0, "colour_q": 1.4, "buzz": 0.0, "attack": 0.008, "scoop": 1.0, "volume": 0.2},
	# A compressed-air horn chord, low, swelling in and long.
	"bus": {"notes": [[233.0, 0.0, 0.85], [294.0, 0.0, 0.85], [349.0, 0.0, 0.85]], "wave": "saw", "colour_hz": 1100.0, "colour_q": 0.9, "buzz": 0.0, "attack": 0.06, "scoop": 0.9, "volume": 0.11},
	# The ambulance's plain horn (the siren is separate).
	"ambulance": {"notes": [[392.0, 0.0, 0.4], [494.0, 0.0, 0.4]], "wave": "square", "colour_hz": 1500.0, "colour_q": 1.1, "buzz": 0.0, "attack": 0.012, "scoop": 1.0, "volume": 0.13},
	# A truck's air horn, a fourth above the bus's lowest note and shorter (G-373).
	"goods": {"notes": [[262.0, 0.0, 0.7], [330.0, 0.0, 0.7]], "wave": "saw", "colour_hz": 900.0, "colour_q": 0.9, "buzz": 0.0, "attack": 0.05, "scoop": 0.92, "volume": 0.12},
}

## The engine's rpm sample points, as shares of the way from idle to the change point (1.05 is
## just above it). Each point has an off-load (coasting) and an on-load (accelerating) loop.
const RPM_POINTS: PackedFloat32Array = [0.0, 0.3, 0.62, 1.05]


## The vehicle and traffic names the game uses, mapped to a sound kind (unknown kinds sound like a car).
static func sound_kind(name: String) -> String:
	match name:
		"hatchback", "taxi", "police", "gang", "gang_car":
			return "car"
		"saloon", "suv", "coupe", "sedan":
			return "premium"
		"motorbike", "scooter":
			return "bike"
		"bullet", "enfield", "bike350":
			return "thumper"
		"autorickshaw", "auto_rickshaw", "share_auto":
			return "auto"
		"goods_carrier", "truck":
			return "goods"
	# Every bus variant (bus_city, bus_lowfloor, bus_intercity, bus_mofussil, bus_school) sounds like the bus.
	if name.begins_with("bus_"):
		return "bus"
	return name if KINDS.has(name) else "car"


static func engine(kind: String) -> Dictionary:
	return ENGINES.get(sound_kind(kind), ENGINES["car"])


## The rpm of a sample point (see RPM_POINTS).
static func point_rpm(profile: Dictionary, share: float) -> float:
	var idle: float = profile["idle_rpm"]
	return idle + (float(profile["shift_rpm"]) - idle) * share


## Engine speed at `speed` m/s with the accelerator at `throttle` (0..1). Gears follow the HUD's
## rule (equal shares of top speed); revs climb through a gear and drop at each change. Standing
## still with the accelerator down, the engine revs freely.
static func engine_rpm(profile: Dictionary, speed: float, throttle: float) -> float:
	var top: float = profile["top_speed"]
	var idle: float = profile["idle_rpm"]
	var span: float = float(profile["shift_rpm"]) - idle
	var gears: int = profile["gears"]
	var t := clampf(throttle, 0.0, 1.0)
	if absf(speed) < 0.4:
		return idle + span * float(profile["free_rev"]) * t
	var position := clampf(absf(speed) / top, 0.0, 1.0) * gears * 1.05
	var g := gear_for(profile, speed)
	var within: float
	if g == gears:
		within = minf(1.25, position - (g - 1))
	else:
		within = clampf(position - (g - 1), 0.0, 1.0)
	var lugging := 0.15 if g == 1 else 0.42
	var rpm := idle + span * (lugging + (1.0 - lugging) * within)
	return rpm * (0.94 + 0.06 * t)


## The gear at this speed (1 at a standstill).
static func gear_for(profile: Dictionary, speed: float) -> int:
	var gears: int = profile["gears"]
	var position := clampf(absf(speed) / float(profile["top_speed"]), 0.0, 1.0) * gears * 1.05
	return mini(gears, 1 + floori(position))


## Combustion pulses per second at this engine speed: the note you hear.
static func firing_hz(profile: Dictionary, rpm: float) -> float:
	var cylinders: float = profile["cylinders"]
	var per_turn := cylinders / 2.0 if int(profile["strokes"]) == 4 else cylinders
	return rpm / 60.0 * per_turn


## How a sound at `at` (x, z) is heard from a listener at `from` facing `yaw` (forward is
## (-sin, -cos)): {gain 0..1, pan -1..1, cutoff Hz}. Full within `near` m, inverse distance after,
## faded to silence over the last quarter before `far`, duller with distance.
static func place(from: Vector2, yaw: float, at: Vector2, near: float = 6.0, far: float = 60.0) -> Dictionary:
	var d := at - from
	var distance := d.length()
	if distance >= far:
		return {"gain": 0.0, "pan": 0.0, "cutoff": 600.0}
	var falloff := near / maxf(near, distance)
	var edge := clampf((far - distance) / (far * 0.25), 0.0, 1.0)
	var right := 0.0 if distance < 0.01 else (d.x * cos(yaw) - d.y * sin(yaw)) / distance
	return {"gain": falloff * edge, "pan": clampf(right * 0.85, -1.0, 1.0), "cutoff": 600.0 + 7400.0 * pow(1.0 - distance / far, 2.0)}


## Seconds between footsteps at `speed` m/s: about 1.9 steps a second walking, 2.8 running.
static func step_interval(speed: float) -> float:
	var s := maxf(0.3, speed)
	var stride := 0.72 if s < 2.2 else minf(1.45, 0.72 + (s - 2.2) * 0.25)
	return clampf(stride / s, 0.28, 0.75)


static func _bump(h: float, centre: float, width: float) -> float:
	return exp(-pow((h - centre) / width, 2.0))


## The city's background level by hour: quiet before dawn, the morning rush, a daytime plateau,
## the evening rush loudest (6 to 8 pm on Chennai's roads), fading at night.
static func city_level(hour: float) -> float:
	var h := fposmod(hour, 24.0)
	return clampf(0.12 + 0.55 * _bump(h, 13, 6) + 0.35 * _bump(h, 9, 1.6) + 0.45 * _bump(h, 19, 1.8) - 0.1 * _bump(h, 3, 2), 0.0, 1.0)


## Birds and insects by hour: the koel at dawn, crows by day, crickets after dark.
static func wildlife(hour: float) -> Dictionary:
	var h := fposmod(hour, 24.0)
	return {
		"koel": clampf(_bump(h, 6.3, 1.2), 0.0, 1.0),
		"crows": clampf(0.5 + 0.5 * _bump(h, 8, 2), 0.0, 1.0) if h > 6.0 and h < 18.5 else 0.0,
		"crickets": 1.0 if h >= 19.0 or h < 5.0 else clampf(_bump(h, 19, 0.6) + _bump(h, 5, 0.6), 0.0, 1.0),
	}


## Chance per second that a stopped vehicle near the player honks: often in the rushes, rarely in
## the small hours, more the longer the queue has stood.
static func honk_chance(hour: float, stopped_seconds: float) -> float:
	if stopped_seconds < 1.5:
		return 0.0
	return minf(0.12, 0.02 * (0.3 + city_level(hour)) * minf(3.0, stopped_seconds / 2.0))


## How loud each ambience bed should be (0..1 of its own full level) for a place and hour.
## coast: metres to the sea (INF inland); traffic 0..1 nearby; rain 0..1; street: the kind of
## street (`PlaceMap.KINDS`, "" when unknown) for the market murmur and the tea stall (G-376).
static func ambience_levels(hour: float, rain: float, coast: float, traffic: float, street: StringName = &"") -> Dictionary:
	var birds := wildlife(hour)
	var sea := 0.0 if is_inf(coast) else maxf(0.0, 1.0 - coast / 450.0)
	var dry := 1.0 - clampf(rain, 0.0, 1.0)
	var out := {
		"city": city_level(hour) * (0.5 + 0.5 * clampf(traffic, 0.0, 1.0)),
		"rain": clampf(rain, 0.0, 1.0),
		"sea": sea,
		"crickets": float(birds["crickets"]) * dry,
	}
	var shops := street_levels(street, hour)
	out["market"] = float(shops["market"]) * (0.6 + 0.4 * dry)
	out["tea"] = float(shops["tea"]) * (0.5 + 0.5 * dry)
	return out


## The people-made beds of a street kind at an hour: the market murmur (loudest in the market
## itself, a little in a station and a busy street), the tea stall (a shopfront on streets and lanes,
## busiest at the morning and the evening rush), by the day's crowd (`city_level`).
static func street_levels(street: StringName, hour: float) -> Dictionary:
	var crowd := clampf(city_level(hour) * 1.4, 0.0, 1.0)
	var market := 0.0
	var tea := 0.0
	match street:
		&"market":
			market = 1.0 * crowd
			tea = 0.5 * crowd
		&"station":
			market = 0.35 * crowd
			tea = 0.3 * crowd
		&"street":
			market = 0.12 * crowd
			tea = 0.4 * crowd
		&"lane":
			tea = 0.3 * crowd
		&"temple":
			market = 0.15 * crowd
		&"main_road":
			market = 0.1 * crowd
	var morning := _bump(fposmod(hour, 24.0), 7.5, 1.8) + _bump(fposmod(hour, 24.0), 17.0, 2.0)
	return {"market": market, "tea": tea * clampf(0.5 + morning, 0.0, 1.0)}


## Seconds until the next far-off temple bell near a temple: sooner at the morning and evening
## pooja (about 6 and 18 hours), rarely in the small hours.
static func temple_bell_wait(hour: float) -> float:
	var h := fposmod(hour, 24.0)
	var pooja := clampf(_bump(h, 6.0, 1.0) + _bump(h, 18.0, 1.2), 0.0, 1.0)
	var asleep := 1.0 if h < 4.5 or h > 22.5 else 0.0
	return lerpf(60.0, 18.0, pooja) * (3.0 if asleep > 0.5 else 1.0)
