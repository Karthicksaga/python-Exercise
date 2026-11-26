class_name StationLayout
extends RefCounted
## How a station is laid out around each drawn platform, and what its departure board says (port
## of `packages/rail/src/station.ts`).
##
## OSM gives the tracks and the station's position; everything here is invented to look like a
## Chennai suburban station (estimated, not surveyed): the foot-over-bridge (FOB) spans every
## track within reach of the platform and lands beyond the outermost one, where the booking
## office stands; platforms are numbered from the first line's side; the board lists the next
## trains from the timetable. Pure data: the station view and the crowd read the same layout.

## FOB deck height above the ground, metres (clears the overhead wires; estimated).
const FOB_HEIGHT := 7.2
## FOB stairs on the platform: run along the platform, metres.
const FOB_STAIR_RUN := 12.5
## Half the FOB deck's width (along the platform), metres.
const FOB_HALF_WIDTH := 1.5
## How far from the stop's centre the FOB crosses, metres (towards the front of the train).
const FOB_AT := -30.0
## Tracks this far from a platform still count as the station's (the FOB spans them), metres.
const STATION_REACH := 32.0


## A line that stops at a platform, and where its track runs in the platform's frame.
class Service:
	extends RefCounted
	var line: RailLine
	## Index of the stop in `line.stops`.
	var stop: int = 0
	## The track's centre, metres to the left of the owning line's direction (owner's track is 0).
	var track: float = 0.0
	## The platform edge this line's trains stand at (same frame).
	var edge: float = 0.0
	## From the edge into the platform: +1 or -1.
	var inward: int = 1
	## Platform number painted on the boards (estimated numbering).
	var number: int = 1


## A drawn platform and the station around it. Lateral distances are in the owning line's frame.
class Platform:
	extends RefCounted
	## Unique per drawn platform: line id and stop index.
	var key: String = ""
	var station: RailNetwork.Station
	var line: RailLine
	var stop: RailLine.Stop
	var index: int = 0
	var island: bool = false
	## Lateral range of the deck, near edge (the owner's track side) to far edge.
	var near: float = 0.0
	var far: float = 0.0
	var services: Array[Service] = []
	## Foot-over-bridge: along the platform (from the stop's centre) and across, `from` to `to`.
	var fob_u: float = FOB_AT
	var fob_from: float = 0.0
	var fob_to: float = 0.0
	## Booking office at the FOB's outer landing: along, across, facing (+1/-1 across).
	var office_u: float = FOB_AT
	var office_w: float = 0.0
	var office_facing: int = 1
	## Where people leave the platform (along it): its two end ramps and the FOB stair foot.
	var exits: PackedFloat64Array = PackedFloat64Array()
	## Busier stations get bigger crowds (Egmore, the islands); 0.5 to 1.
	var busy: float = 0.55

	## The deck's middle across.
	func middle() -> float:
		return (near + far) / 2.0

	## A point in the platform frame (`u` along from the stop's centre, `w` to the left) in world metres.
	func world(u: float, w: float) -> Vector2:
		return line.path.beside(stop.s + u, w)

	## Rail-top height under the platform (the viaduct; 0 on the ground).
	func base() -> float:
		return line.height_at(stop.s)


## One row of a departure board.
class BoardRow:
	extends RefCounted
	var destination: String = ""
	var platform: int = 1
	## Seconds until it arrives (0 while it stands at the platform).
	var wait: float = 0.0
	## "On platform", "Arriving", "Due" or "N min".
	var status: String = ""


## Lay out every drawn platform (one per non-twin stop). Other tracks near the platform come from
## the rail file, so the FOB spans the yard as mapped.
static func platforms(network: RailNetwork) -> Array[Platform]:
	var tracks: Array[RailPath] = []
	# Each track's box: the regional network has 1,300 tracks, so only the few whose box reaches a
	# platform are projected onto (G-461).
	var boxes: Array[Rect2] = []
	for t in network.tracks:
		if t.kind == "main" and t.points.size() >= 2:
			tracks.append(RailPath.new(t.points))
			var box := Rect2(t.points[0], Vector2.ZERO)
			for q in t.points:
				box = box.expand(q)
			boxes.append(box.grow(STATION_REACH + 8.0))
	var out: Array[Platform] = []
	for line in network.lines:
		for index in line.stops.size():
			var stop := line.stops[index]
			if stop.twin:
				continue
			# A Metro station in a tunnel has no platform on the map (G-462).
			if line.underground_at(stop.s):
				continue
			var station := network.station(stop.id)
			if station == null:
				station = RailNetwork.Station.new()
				station.id = stop.id
				station.name = stop.name
				station.name_ta = stop.name_ta
			var side := stop.side
			var near := side * RailRules.PLATFORM_EDGE
			var far := side * (RailRules.PLATFORM_EDGE + stop.width)
			var island := stop.width > 6.0
			# Other tracks' laterals near the platform's middle (projected back into this line's frame).
			var centre := line.path.at(stop.s).point()
			var laterals: Array[float] = [0.0]
			for ti in tracks.size():
				if not boxes[ti].has_point(centre):
					continue
				var path := tracks[ti]
				var hit := path.project_near(centre, STATION_REACH + 4.0)
				if hit.distance > STATION_REACH + 4.0:
					continue
				var p := path.at(hit.s).point()
				var back := line.path.project_near(p, STATION_REACH + 8.0)
				if absf(back.s - stop.s) > 6.0:
					continue
				if absf(back.lateral) < 1.0 or absf(back.lateral) > STATION_REACH:
					continue
				var known := false
				for l in laterals:
					if absf(l - back.lateral) < 1.5:
						known = true
				if not known:
					laterals.append(back.lateral)
			var own := Service.new()
			own.line = line
			own.stop = index
			own.track = 0.0
			own.edge = near
			own.inward = side
			own.number = 1
			var services: Array[Service] = [own]
			for other in network.lines:
				if other == line:
					continue
				var twin_index := -1
				for k in other.stops.size():
					if other.stops[k].id == stop.id and other.stops[k].twin:
						twin_index = k
						break
				if twin_index < 0:
					continue
				var twin := other.stops[twin_index]
				var back := line.path.project(other.path.at(twin.s).point())
				var sv := Service.new()
				sv.line = other
				sv.stop = twin_index
				sv.track = back.lateral
				sv.inward = -1 if back.lateral > (near + far) / 2.0 else 1
				sv.edge = back.lateral + sv.inward * RailRules.PLATFORM_EDGE
				sv.number = 2
				services.append(sv)
			# Side platforms of the other direction (no twin) are numbered 2 too.
			if services.size() == 1 and line != network.lines[0]:
				services[0].number = 2
			var lo := minf(minf(far, near), _min(laterals)) - 5.0
			var hi := maxf(maxf(far, near), _max(laterals)) + 5.0
			var office_side := (1 if absf(hi) > absf(lo) else -1) if island else side
			var half := RailRules.PLATFORM_LENGTH / 2.0
			var p := Platform.new()
			p.key = "%s:%d" % [line.id, index]
			p.station = station
			p.line = line
			p.stop = stop
			p.index = index
			p.island = island
			p.near = near
			p.far = far
			p.services = services
			p.fob_from = lo
			p.fob_to = hi
			p.office_w = hi + 5.0 if office_side > 0 else lo - 5.0
			p.office_facing = -1 if office_side > 0 else 1
			p.exits = PackedFloat64Array([-half + 1.0, half - 1.0, FOB_AT + FOB_HALF_WIDTH + FOB_STAIR_RUN + 0.8])
			p.busy = minf(1.0, (0.8 if island else 0.55) + (0.2 if station.name.contains("Egmore") else 0.0))
			out.append(p)
	return out


static func _min(values: Array[float]) -> float:
	var m := INF
	for v in values:
		m = minf(m, v)
	return m


static func _max(values: Array[float]) -> float:
	var m := -INF
	for v in values:
		m = maxf(m, v)
	return m


## Status text for a train `wait` seconds away (0 when standing, `standing` true).
static func board_status(wait: float, standing: bool) -> String:
	if standing:
		return Tr.t("rail.status.on_platform")
	if wait < 45.0:
		return Tr.t("rail.status.arriving")
	var minutes := ceili(wait / 60.0)
	return Tr.t("rail.status.due") if minutes <= 1 else Tr.t("rail.status.min", [minutes])


## The next trains at a platform, soonest first: each service's next train and the one after, at
## most `rows` in all. Trains that run off the map still show their real destination.
static func departure_rows(platform: Platform, clock: float, rows: int = 3) -> Array[BoardRow]:
	var out: Array[BoardRow] = []
	for service in platform.services:
		var line := service.line
		# A train ending its run here takes no passengers.
		if service.stop == line.stops.size() - 1 and not line.to.beyond:
			continue
		var wait := line.next_arrival(service.stop, clock)
		if is_inf(wait):
			continue
		var standing := false
		if wait == 0.0:
			for t in line.trains(clock):
				if t.state.stopped_at == service.stop:
					standing = true
		out.append(_row(line.destination(), service.number, wait, board_status(wait, standing)))
		var later := wait + line.headway
		out.append(_row(line.destination(), service.number, later, board_status(later, false)))
	out.sort_custom(func(a: BoardRow, b: BoardRow) -> bool: return a.wait < b.wait)
	return out.slice(0, rows)


static func _row(destination: String, number: int, wait: float, status: String) -> BoardRow:
	var r := BoardRow.new()
	r.destination = destination
	r.platform = number
	r.wait = wait
	r.status = status
	return r


## "17:05" for a time of day in hours.
static func clock_text(hour: float) -> String:
	var minutes := floori(fposmod(hour, 24.0) * 60.0)
	return "%02d:%02d" % [minutes / 60, minutes % 60]


## The board's lines of text, for drawing and for tests: a header, then one line per train.
static func board_text(platform: Platform, clock: float, hour: float) -> PackedStringArray:
	var out := PackedStringArray(["%s  %s" % [platform.station.name.to_upper(), clock_text(hour)]])
	for row in departure_rows(platform, clock):
		out.append("PF %d  %s  %s" % [row.platform, row.destination.to_upper(), row.status.to_upper()])
	return out
