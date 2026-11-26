class_name MapRailFeed
extends RefCounted
## The rail network as the maps' `MapRail` (G-465): one kind per system, the Metro by its line,
## each line's track as segments (tunnels apart), one direction of each pair of parallel lines (the
## two directions run a few metres apart: one stroke at map scale), and every station that a line
## calls at, as a dot with its name. Pure; run it on a worker thread once the network is loaded.

## Colours per kind (plain colours: the Metro's by its lines' public names, no operator marks).
const COLOURS := {
	&"suburban": Color(0.96, 0.62, 0.18),
	&"mrts": Color(0.80, 0.42, 0.88),
	&"express": Color(0.90, 0.30, 0.28),
	&"metro_blue": Color(0.25, 0.55, 1.0),
	&"metro_green": Color(0.30, 0.82, 0.42),
}
## Lines closer than this to an already drawn line (at every sample) are the other direction of
## it, or a service on its track (the expresses run on the suburban lines' tracks), metres.
const SAME_TRACK := 40.0
## Points closer together than this along a line are merged for the map, metres.
const STEP := 60.0


static func kind_of(line: RailLine) -> StringName:
	if line.is_metro():
		return &"metro_green" if line.metro_line == "green" else &"metro_blue"
	match line.system:
		"mrts":
			return &"mrts"
		"express":
			return &"express"
	return &"suburban"


static func label_of(key: StringName) -> String:
	match key:
		&"mrts":
			return RailText.LINE_MRTS
		&"express":
			return RailText.LINE_EXPRESS
		&"metro_blue":
			return RailText.LINE_METRO_BLUE
		&"metro_green":
			return RailText.LINE_METRO_GREEN
	return RailText.LINE_SUBURBAN


static func build(network: RailNetwork) -> MapRail:
	var out := MapRail.new()
	# Kinds in a fixed order, so the legend reads the same every time.
	for key: StringName in [&"suburban", &"mrts", &"express", &"metro_blue", &"metro_green"]:
		var has := false
		for line in network.lines:
			if kind_of(line) == key:
				has = true
		if has:
			out.add_kind(key, label_of(key), COLOURS[key] as Color)
	var drawn: Array = []
	for line in network.lines:
		var key := kind_of(line)
		if _retraces(line, drawn):
			continue
		drawn.append(line)
		var k := out.kind(key)
		var s := 0.0
		var length := line.path.length()
		var prev := line.path.at(0.0).point()
		var prev_under := line.underground_at(0.0)
		while s < length:
			s = minf(length, s + STEP)
			var p := line.path.at(s).point()
			var under := line.underground_at(s)
			# Packed arrays are values: append to the kind's own array.
			if under and prev_under:
				k.under.append(prev)
				k.under.append(p)
			else:
				k.lines.append(prev)
				k.lines.append(p)
			prev = p
			prev_under = under
	# A kind whose every line runs on another kind's track has nothing of its own to draw.
	var kept: Array[MapRail.Kind] = []
	for k in out.kinds:
		if not k.lines.is_empty() or not k.under.is_empty():
			kept.append(k)
	out.kinds = kept
	# Stations: one dot per station a line calls at, coloured by the first kind that calls there.
	var seen: Dictionary[String, bool] = {}
	for line in network.lines:
		for stop in line.stops:
			if seen.has(stop.id):
				continue
			seen[stop.id] = true
			var st := network.station(stop.id)
			var at := Vector2(st.x, st.z) if st != null else line.path.at(stop.s).point()
			# A station point can be beside the platforms: put the dot on the line.
			if at.distance_to(line.path.at(stop.s).point()) > 60.0:
				at = line.path.at(stop.s).point()
			out.station_points.append(at)
			out.station_names.append(stop.name)
			out.station_colours.append(COLOURS[kind_of(line)] as Color)
	out.index()
	return out


## True when `line` runs within SAME_TRACK of one of `others` at every sample (the other direction).
static func _retraces(line: RailLine, others: Array) -> bool:
	for o: Variant in others:
		var other := o as RailLine
		var all := true
		for k in 9:
			var p := line.path.at(line.path.length() * (0.05 + 0.1125 * k)).point()
			if other.path.project_near(p, SAME_TRACK).distance > SAME_TRACK:
				all = false
				break
		if all:
			return true
	return false
