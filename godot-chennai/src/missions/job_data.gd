## City job data as typed classes (port of the types in `missions/src/jobs.ts` and
## `shareAuto.ts`). Loaded from the baked content table with `from_dict`.
class_name JobData
extends RefCounted

const KINDS: Array[String] = ["ambulance", "courier", "cab", "bus", "share"]


class Stop:
	var label := ""
	var x := 0.0
	var z := 0.0
	var radius := 0.0
	## Seconds stopped in the marker (loading); not used when the stop has a fare or goods.
	var dwell := 0.0
	var fare: MissionData.Fare = null
	var goods: MissionData.Goods = null
	## Bus timetable: seconds after the start by which the stop is due (-1: none).
	var due := -1.0

	static func make(text: String, px: float, pz: float, r: float, dwell_s: float = 0.0, due_s: float = -1.0) -> Stop:
		var s := Stop.new()
		s.label = text
		s.x = px
		s.z = pz
		s.radius = r
		s.dwell = dwell_s
		s.due = due_s
		return s

	static func from_dict(d: Dictionary) -> Stop:
		var s := make(MissionData._s(d, "label"), MissionData._f(d, "x"), MissionData._f(d, "z"), MissionData._f(d, "radius"), MissionData._f(d, "dwell"), MissionData._f(d, "due", -1.0))
		if d.get("fare") is Dictionary:
			s.fare = MissionData.Fare.from_dict(d["fare"])
		if d.get("goods") is Dictionary:
			s.goods = MissionData.Goods.from_dict(d["goods"])
		return s


## A road to keep off: samples {x, z, radius}, the name for the HUD, and free seconds inside.
class AvoidZone:
	var name := ""
	var points: Array[Dictionary] = []
	var grace := 0.0

	static func from_dict(d: Dictionary) -> AvoidZone:
		var a := AvoidZone.new()
		a.name = MissionData._s(d, "name")
		a.grace = MissionData._f(d, "grace")
		for p: Dictionary in d.get("points", []):
			a.points.append({"x": MissionData._f(p, "x"), "z": MissionData._f(p, "z"), "radius": MissionData._f(p, "radius")})
		return a


## A share auto route: centre line ([{x, z}], driving order), kerb and lane offsets.
class ShareRoute:
	var name := ""
	var from := ""
	var to := ""
	var points: Array = []
	var kerb := 0.0
	var lane := 0.0

	static func make(route_name: String, start: String, finish: String, pts: Array, kerb_m: float, lane_m: float) -> ShareRoute:
		var r := ShareRoute.new()
		r.name = route_name
		r.from = start
		r.to = finish
		r.points = pts
		r.kerb = kerb_m
		r.lane = lane_m
		return r

	static func from_dict(d: Dictionary) -> ShareRoute:
		var pts: Array = []
		for p: Dictionary in d.get("points", []):
			pts.append({"x": MissionData._f(p, "x"), "z": MissionData._f(p, "z")})
		return make(MissionData._s(d, "name"), MissionData._s(d, "from"), MissionData._s(d, "to"), pts, MissionData._f(d, "kerb"), MissionData._f(d, "lane"))


class Job:
	var id := ""
	var kind := ""
	var title := ""
	var brief := ""
	var vehicle := ""
	var stops: Array[Stop] = []
	## Seconds for the whole job, from the moment the player is in the vehicle.
	var time_limit := 0.0
	## Rupees for a perfect run, and taken when it fails.
	var payout := 0
	var fine := 0
	var min_reputation := 0
	## Bumps that end the job (-1: no limit).
	var max_bumps := -1
	## Game hours when offered, {from, to}; empty: always.
	var hours: Dictionary = {}
	var avoid: AvoidZone = null
	## The clock starts only within this many metres of the first stop (-1: anywhere).
	var start_radius := -1.0
	var share: ShareRoute = null

	static func make(job_id: String, job_kind: String, kind_of_vehicle: String, job_stops: Array, limit: float, pay: int, fine_rupees: int) -> Job:
		var j := Job.new()
		j.id = job_id
		j.kind = job_kind
		j.title = job_id
		j.vehicle = kind_of_vehicle
		for s: Stop in job_stops:
			j.stops.append(s)
		j.time_limit = limit
		j.payout = pay
		j.fine = fine_rupees
		return j

	static func from_dict(d: Dictionary) -> Job:
		var stop_list: Array = []
		for s: Dictionary in d.get("stops", []):
			stop_list.append(Stop.from_dict(s))
		var j := make(MissionData._s(d, "id"), MissionData._s(d, "kind"), MissionData._s(d, "vehicle"), stop_list, MissionData._f(d, "timeLimit"), int(MissionData._f(d, "payout")), int(MissionData._f(d, "fine")))
		j.title = MissionData._s(d, "title")
		j.brief = MissionData._s(d, "brief")
		j.min_reputation = int(MissionData._f(d, "minReputation"))
		j.max_bumps = int(MissionData._f(d, "maxBumps", -1))
		if d.get("hours") is Dictionary:
			j.hours = {"from": MissionData._f(d["hours"], "from"), "to": MissionData._f(d["hours"], "to")}
		if d.get("avoid") is Dictionary:
			j.avoid = AvoidZone.from_dict(d["avoid"])
		j.start_radius = MissionData._f(d, "startRadius", -1.0)
		if d.get("share") is Dictionary:
			j.share = ShareRoute.from_dict(d["share"])
		return j
