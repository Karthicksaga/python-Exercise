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
