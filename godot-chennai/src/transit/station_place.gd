class_name StationPlace
extends RefCounted
## A railway station as a place the player can be at (decision G-217): its OSM position and names
## (Tamil and English), the entry area (a circle round the station point and its mapped
## entrances), its platforms (OSM `railway=platform`, numbered by their `ref`; osmdetail draws
## them, the landmarks agent the station buildings of Central and Egmore) and the lines that call
## there with their next trains (`TrainService`). Pure logic, no nodes.

## Radius round the station point that counts as being at the station, metres.
const ENTRY_RADIUS := 70.0
## Radius round a mapped entrance, metres.
const ENTRANCE_RADIUS := 18.0
## A platform counts as "at" the player within this many metres of its middle.
const PLATFORM_REACH := 25.0


class Platform:
	extends RefCounted
	var ref: String = ""
	var position: Vector2 = Vector2.ZERO
	var length: float = 0.0


var station: TransitNetwork.Station
var platforms: Array[Platform] = []
var entrances: PackedVector2Array = PackedVector2Array()


## Builds the place for a station from the network's station row (`platforms` and `entrances`
## from transit.json; pass the row with `row`).
static func make(st: TransitNetwork.Station, row: Dictionary = {}) -> StationPlace:
	var p := StationPlace.new()
	p.station = st
	for item: Variant in row.get("platforms", []):
		var r := item as Array
		var pf := Platform.new()
		pf.ref = String(r[0])
		pf.position = Vector2(float(r[1]), float(r[2]))
		pf.length = float(r[3])
		p.platforms.append(pf)
	for item: Variant in row.get("entrances", []):
		var r := item as Array
		p.entrances.append(Vector2(float(r[0]), float(r[1])))
	return p


## True when p is inside the station's entry area.
func inside(p: Vector2) -> bool:
	if p.distance_to(station.position) <= ENTRY_RADIUS:
		return true
	for e in entrances:
		if p.distance_to(e) <= ENTRANCE_RADIUS:
			return true
	for pf in platforms:
		if p.distance_to(pf.position) <= maxf(PLATFORM_REACH, pf.length * 0.5):
			return true
	return false


## The platform nearest p within reach, or null.
func platform_at(p: Vector2) -> Platform:
	var best: Platform = null
	var bd := INF
	for pf in platforms:
		var d := p.distance_to(pf.position)
		if d <= maxf(PLATFORM_REACH, pf.length * 0.5) and d < bd:
			bd = d
			best = pf
	return best


## Platform names for the HUD ("1", "2", …; unnamed ones are counted, not invented).
func platform_list() -> PackedStringArray:
	var out := PackedStringArray()
	var unnamed := 0
	var named: Array[String] = []
	for pf in platforms:
		var ref := pf.ref.trim_prefix("Platform").trim_prefix("platform").strip_edges()
		if ref != "":
			if not named.has(ref):
				named.append(ref)
		else:
			unnamed += 1
	named.sort_custom(func(x: String, y: String) -> bool: return x.naturalnocasecmp_to(y) < 0)
	out.append_array(PackedStringArray(named))
	if unnamed > 0:
		out.append("%d unnamed" % unnamed)
	return out


## Every station of the network as a place (with its platforms and entrances).
static func all_from(net: TransitNetwork) -> Array[StationPlace]:
	var out: Array[StationPlace] = []
	for st in net.stations:
		out.append(make(st, net.station_rows[st.index] if st.index < net.station_rows.size() else {}))
	return out


## The station place the point is in, or null.
static func find(places: Array[StationPlace], p: Vector2) -> StationPlace:
	for sp in places:
		if sp.station.position.distance_to(p) < 600.0 and sp.inside(p):
			return sp
	return null
