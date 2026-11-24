## Mission data as typed classes (port of `missions/src/types.ts`, `fares.ts` Fare, `goods.ts`
## Goods). Missions are plain data, loaded from the baked content table (`content/content.json`,
## G-41) with `from_dict`, so new stages need no code. Positions are metres, +X east, -Z north
## (TD-2); a path point is a Dictionary {x, z} of doubles (Vector2 is 32-bit).
class_name MissionData
extends RefCounted

## Ways of travelling. "foot" is walking; the rest are vehicle kinds.
const MODES: Array[String] = ["foot", "car", "auto", "bike", "ambulance", "bus"]


static func _f(d: Dictionary, key: String, fallback: float = 0.0) -> float:
	var v: Variant = d.get(key, fallback)
	return float(v) if v != null else fallback


static func _s(d: Dictionary, key: String, fallback: String = "") -> String:
	var v: Variant = d.get(key, fallback)
	return str(v) if v != null else fallback


## People who get in or out at a stop (`fares.ts` Fare).
class Fare:
	var board := 0
	var alight := 0
	## Where they wait (or walk to after getting out), on the pavement beside the marker.
	var kerb_x := 0.0
	var kerb_z := 0.0
	## The hint the kerb was baked with (`FareSpots.kerb_spot`): the side of the road the real place
	## is on (+1 right of the road's drawn direction, -1 left, 0 none) and metres along the road.
	var kerb_side := 0
	var kerb_shift := 0.0
	## A patient (the ambulance): slower in and out.
	var patient := false
	## For drawing only ("wedding"): no effect on the rules.
	var party := ""

	static func make(board_n: int, alight_n: int, kx: float, kz: float, is_patient: bool = false) -> Fare:
		var f := Fare.new()
		f.board = board_n
		f.alight = alight_n
		f.kerb_x = kx
		f.kerb_z = kz
		f.patient = is_patient
		return f

	static func from_dict(d: Dictionary) -> Fare:
		var kerb: Dictionary = d.get("kerb", {})
		var f := make(int(MissionData._f(d, "board")), int(MissionData._f(d, "alight")), MissionData._f(kerb, "x"), MissionData._f(kerb, "z"), bool(d.get("patient", false)))
		f.party = MissionData._s(d, "party")
		f.kerb_side = int(MissionData._f(d, "kerbSide"))
		f.kerb_shift = MissionData._f(d, "kerbShift")
		return f

	func to_dict() -> Dictionary:
		var d := {"kerb": {"x": kerb_x, "z": kerb_z}}
		if board != 0:
			d["board"] = board
		if alight != 0:
			d["alight"] = alight
		if patient:
			d["patient"] = true
		if party != "":
			d["party"] = party
		return d


## Goods handed over at a stop (`goods.ts` Goods).
class Goods:
	## "load": the person at the kerb hands the goods over; "unload": they take them.
	var action := "load"
	var items: Array[String] = []
	var kerb_x := 0.0
	var kerb_z := 0.0
	## The kerb's baked hint (see `Fare`).
	var kerb_side := 0
	var kerb_shift := 0.0
	## "sender", "recipient", "shopkeeper": for drawing only.
	var who := ""
	## For a drop not loaded earlier: "start" aboard from the stage start, "here" only at this stop.
	var aboard := ""

	static func make(act: String, things: Array, kx: float, kz: float, aboard_when: String = "") -> Goods:
		var g := Goods.new()
		g.action = act
		for t: Variant in things:
			g.items.append(str(t))
		g.kerb_x = kx
		g.kerb_z = kz
		g.aboard = aboard_when
		return g

	static func from_dict(d: Dictionary) -> Goods:
		var kerb: Dictionary = d.get("kerb", {})
		var g := make(MissionData._s(d, "action", "load"), d.get("items", []), MissionData._f(kerb, "x"), MissionData._f(kerb, "z"), MissionData._s(d, "aboard"))
		g.who = MissionData._s(d, "who")
		g.kerb_side = int(MissionData._f(d, "kerbSide"))
		g.kerb_shift = MissionData._f(d, "kerbShift")
		return g


## One step of a stage. `type` is "reach", "chase", "defeat", "evade" or "enter".
class Objective:
	var type := "reach"
	var label := ""
	var x := 0.0
	var z := 0.0
	var radius := 0.0
	## reach: required mode ("" for any); stop inside the marker; seconds allowed (0: untimed);
	## an ambush group placed meanwhile; people or goods changing hands; reached by train.
	var mode := ""
	var stop := false
	var time_limit := 0.0
	var hostiles := ""
	var fare: Fare = null
	var goods: Goods = null
	var by_train := false
	## chase: the quarry's road points [{x, z}], speed m/s and vehicle kind.
	var path: Array = []
	var speed := 0.0
	var quarry := ""
	## defeat: the enemy group to beat.
	var group := ""
	## evade: stars the game raises the wanted level to.
	var stars := 0
	## enter: the vehicle kind to get into.
	var vehicle := ""
	## G-140..G-143: a name other objectives can jump to, a checkpoint (a retry starts here once
	## this objective is done), the objective a failure branches to (fail-forward) with the
	## fraction of the reward then paid, and `strict`: a wrecked vehicle or a downed player fails it.
	var id := ""
	var checkpoint := false
	var on_fail := ""
	var on_fail_scale := 0.5
	var strict := false
	## choice: [{id, label, detail, reward, reputation, wanted, flag, next}].
	var options: Array[Dictionary] = []
	## tail: the target's `path` and `speed` as for a chase; stay between `near` and `far`, not
	## inside `notice` for more than `grace`; `pauses` [{at, seconds, label}] stop it along the way
	## (a signal, a scooter swap). `radius` is how close the target must be at the end.
	var near := 0.0
	var far := 0.0
	var notice := 0.0
	var grace := 0.0
	var pauses: Array[Dictionary] = []
	## fragile: the reason shown when the cargo is ruined ("cargo_ruined" or "patient_lost").
	var ruin := "cargo_ruined"
	## Zones active while this objective is (flood, procession, strike).
	var hazards: Array[HazardZone] = []
	## fragile: rough patches along the way [{x, z, radius, kind: "breaker"|"pothole", label}].
	var rough: Array[Dictionary] = []

	static func reach(text: String, px: float, pz: float, r: float) -> Objective:
		var o := Objective.new()
		o.type = "reach"
		o.label = text
		o.x = px
		o.z = pz
		o.radius = r
		return o

	static func enter(text: String, kind: String) -> Objective:
		var o := Objective.new()
		o.type = "enter"
		o.label = text
		o.vehicle = kind
		return o

	static func defeat(text: String, name: String, px: float, pz: float, r: float) -> Objective:
		var o := reach(text, px, pz, r)
		o.type = "defeat"
		o.group = name
		return o

	static func evade(text: String, n: int) -> Objective:
		var o := Objective.new()
		o.type = "evade"
		o.label = text
		o.stars = n
		return o

	static func chase(text: String, points: Array, quarry_speed: float, r: float, kind: String) -> Objective:
		var o := Objective.new()
		o.type = "chase"
		o.label = text
		o.path = points
		o.speed = quarry_speed
		o.radius = r
		o.quarry = kind
		return o

	static func from_dict(d: Dictionary) -> Objective:
		var o := Objective.new()
		o.type = MissionData._s(d, "type", "reach")
		o.label = MissionData._s(d, "label")
		o.x = MissionData._f(d, "x")
		o.z = MissionData._f(d, "z")
		o.radius = MissionData._f(d, "radius")
		o.mode = MissionData._s(d, "mode")
		o.stop = bool(d.get("stop", false))
		o.time_limit = MissionData._f(d, "timeLimit")
		o.hostiles = MissionData._s(d, "hostiles")
		if d.get("fare") is Dictionary:
			o.fare = Fare.from_dict(d["fare"])
		if d.get("goods") is Dictionary:
			o.goods = Goods.from_dict(d["goods"])
		o.by_train = bool(d.get("byTrain", false))
		for p: Dictionary in d.get("path", []):
			o.path.append({"x": MissionData._f(p, "x"), "z": MissionData._f(p, "z")})
		o.speed = MissionData._f(d, "speed")
		o.quarry = MissionData._s(d, "quarry")
		o.group = MissionData._s(d, "group")
		o.stars = int(MissionData._f(d, "stars"))
		o.vehicle = MissionData._s(d, "vehicle")
		o.id = MissionData._s(d, "id")
		o.checkpoint = bool(d.get("checkpoint", false))
		o.on_fail = MissionData._s(d, "onFail")
		o.on_fail_scale = MissionData._f(d, "onFailScale", 0.5)
		o.strict = bool(d.get("strict", false))
		for opt: Dictionary in d.get("options", []):
			o.options.append(opt)
		o.near = MissionData._f(d, "near")
		o.far = MissionData._f(d, "far")
		o.notice = MissionData._f(d, "notice")
		o.grace = MissionData._f(d, "grace")
		for pz: Dictionary in d.get("pauses", []):
			o.pauses.append(pz)
		o.ruin = MissionData._s(d, "ruin", "cargo_ruined")
		for h: Dictionary in d.get("hazards", []):
			o.hazards.append(HazardZone.from_dict(h))
		for r: Dictionary in d.get("rough", []):
			o.rough.append(r)
		return o


class Mission:
	var id := ""
	## Stage number shown to the player, from 1.
	var stage := 0
	var title := ""
	var brief := ""
	## Rupees paid on completion.
	var reward := 0
	## Reputation points earned on completion (0 to 100 score shared with the city jobs).
	var reputation := 0
	## Weapons handed over on completion: [{id, ammo}].
	var weapons: Array[Dictionary] = []
	var objectives: Array[Objective] = []
	## G-142: up to 3 optional goals [{id, label, kind, value}] (see `Medals`) and the kind of
	## mission ("stage" or "extra": an extra is played from the board's Stages tab).
	var goals: Array[Dictionary] = []
	var kind := "stage"
	## Where the mission is offered (a place name for the board), and a seed for its events.
	var where := ""

	static func make(mission_id: String, n: int, money: int, steps: Array) -> Mission:
		var m := Mission.new()
		m.id = mission_id
		m.stage = n
		m.title = mission_id
		m.reward = money
		for o: Objective in steps:
			m.objectives.append(o)
		return m

	static func from_dict(d: Dictionary) -> Mission:
		var m := Mission.new()
		m.id = MissionData._s(d, "id")
		m.stage = int(MissionData._f(d, "stage"))
		m.title = MissionData._s(d, "title")
		m.brief = MissionData._s(d, "brief")
		m.reward = int(MissionData._f(d, "reward"))
		m.reputation = int(MissionData._f(d, "reputation"))
		for w: Dictionary in d.get("weapons", []):
			m.weapons.append({"id": str(w.get("id", "")), "ammo": int(MissionData._f(w, "ammo"))})
		for o: Dictionary in d.get("objectives", []):
			m.objectives.append(Objective.from_dict(o))
		for g: Dictionary in d.get("goals", []):
			m.goals.append(g)
		m.kind = MissionData._s(d, "kind", "stage")
		m.where = MissionData._s(d, "where")
		return m


## What the mission system needs to know about the player each step.
class PlayerStatus:
	var x := 0.0
	var z := 0.0
	var mode := "foot"
	## m/s
	var speed := 0.0
	## Enemy groups completely beaten (a set: group -> true).
	var cleared: Dictionary = {}
	var on_train := false
	## Police wanted level, 0 to 5.
	var wanted := 0
	## Driving feel this step (G-143): braking and lateral acceleration (m/s^2, positive), the
	## speed (m/s) over a speed breaker crossed this step (0: none), a pothole hit, a crash impact
	## 0..1, the horn sounded, a red light run, rain 0..1, and the vehicle wrecked / the player down.
	var decel := 0.0
	var lateral := 0.0
	var breaker_speed := 0.0
	var pothole := false
	var crash := 0.0
	var horn := false
	var red_light := false
	var rain := 0.0
	var wrecked := false
	var down := false
	## Inside a no-horn zone (a hospital's surroundings).
	var in_quiet_zone := false

	static func make(px: float, pz: float, travel: String = "foot", v: float = 0.0) -> PlayerStatus:
		var p := PlayerStatus.new()
		p.x = px
		p.z = pz
		p.mode = travel
		p.speed = v
		return p

	func with_cleared(groups: Array) -> PlayerStatus:
		for g: Variant in groups:
			cleared[str(g)] = true
		return self

	func with_wanted(stars: int) -> PlayerStatus:
		wanted = stars
		return self

	func with_train(riding: bool) -> PlayerStatus:
		on_train = riding
		return self
