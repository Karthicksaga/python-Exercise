class_name RailNetwork
extends RefCounted
## The railway at run time (port of `RailNetwork` in `packages/rail/src/network.ts`): every line of
## the rail file, the stations, the drawn tracks and the level crossings. One network for the game
## (G-321): `world/rail/rail.json`, built by `tools/rail/build_rail.py` from the Three.js game's
## OSM extract; it holds the Three.js file's lines unchanged plus every other line that extract
## covers. Pure logic; load it on a worker thread.

## The game's railway file (G-321). The synced Three.js file (`assets/world/rail.json`) stays for
## comparison and the tests only.
const PATH := "res://world/rail/rail.json"


## A station: one board and map mark, whichever lines stop there (`RailStationData`).
class Station:
	extends RefCounted
	var id: String = ""
	var name: String = ""
	var name_ta: String = ""
	var name_hi: String = ""
	var x: float = 0.0
	var z: float = 0.0


## A track as drawn (`RailTrackData`).
class Track:
	extends RefCounted
	var id: int = 0
	## "main" for running lines, "service" for sidings, yards and crossovers.
	var kind: String = "main"
	var points: PackedVector2Array


## A mapped level crossing (Godot addition): where, the track's heading, and each line's distance
## along it there.
class Crossing:
	extends RefCounted
	var id: String = ""
	var x: float = 0.0
	var z: float = 0.0
	var yaw: float = 0.0
	## Line id -> metres along that line.
	var lines: Dictionary[String, float] = {}


var lines: Array[RailLine] = []
var stations: Array[Station] = []
var tracks: Array[Track] = []
var crossings: Array[Crossing] = []
var attribution: String = ""
var error: String = ""


## The network from parsed rail-file JSON.
static func from_data(data: Dictionary) -> RailNetwork:
	var n := RailNetwork.new()
	n.attribution = str(data.get("attribution", ""))
	for item: Variant in data.get("lines", []) as Array:
		n.lines.append(RailLine.from_data(item as Dictionary))
	for item: Variant in data.get("stations", []) as Array:
		var d: Dictionary = item
		var st := Station.new()
		st.id = str(d.get("id", ""))
		st.name = str(d.get("name", ""))
		st.name_ta = str(d.get("nameTa", ""))
		st.name_hi = str(d.get("nameHi", ""))
		st.x = float(d.get("x", 0.0))
		st.z = float(d.get("z", 0.0))
		n.stations.append(st)
	for item: Variant in data.get("tracks", []) as Array:
		var d: Dictionary = item
		var t := Track.new()
		t.id = int(d.get("id", 0))
		t.kind = str(d.get("kind", "main"))
		t.points = RailPath.from_flat(d.get("points", []) as Array).points
		n.tracks.append(t)
	for item: Variant in data.get("crossings", []) as Array:
		var d: Dictionary = item
		var c := Crossing.new()
		c.id = str(d.get("id", ""))
		c.x = float(d.get("x", 0.0))
		c.z = float(d.get("z", 0.0))
		c.yaw = float(d.get("yaw", 0.0))
		for l: Variant in d.get("lines", []) as Array:
			var ld: Dictionary = l
			c.lines[str(ld.get("line", ""))] = float(ld.get("s", 0.0))
		n.crossings.append(c)
	return n


## Reads and parses a rail file (worker thread); `error` says what went wrong.
static func load_file(path: String = PATH) -> RailNetwork:
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		var failed := RailNetwork.new()
		failed.error = "Could not read %s." % path
		return failed
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		var bad := RailNetwork.new()
		bad.error = "%s is not a rail file." % path
		return bad
	return from_data(parsed as Dictionary)


func trains(clock: float) -> Array[RailLine.TrainAt]:
	var out: Array[RailLine.TrainAt] = []
	for line in lines:
		out.append_array(line.trains(clock))
	return out


func line(id: String) -> RailLine:
	for l in lines:
		if l.id == id:
			return l
	return null


func station(id: String) -> Station:
	for s in stations:
		if s.id == id:
			return s
	return null


## Stations' map marks (world metres), for the map and the AI's places.
func station_points() -> PackedVector2Array:
	var out := PackedVector2Array()
	for s in stations:
		out.append(Vector2(s.x, s.z))
	return out
