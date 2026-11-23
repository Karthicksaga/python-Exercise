## Everyday life between jobs (port of `missions/src/life.ts`): home, hospital, gym, mall and
## cinema, and what each activity costs in money and game time. The game applies the outcome;
## this only decides. Outcomes are Dictionaries {ok, message, cost, hours, health?}. Every name,
## film, plot and joke is invented.
class_name Life
extends RefCounted

const MAX_HEALTH := 100
const ENTRANCE_RADIUS := 3.0
const OUTFITS: Array[Dictionary] = [
	{"id": "everyday", "name": "Everyday shirt and trousers", "tint": 0xffffff, "price": 0},
	{"id": "festival", "name": "Green festival shirt", "tint": 0x7fc48a, "price": 0},
	{"id": "maroon-shirt", "name": "Maroon silk-cotton shirt", "tint": 0xb85a5a, "price": 600},
	{"id": "track-suit", "name": "Blue track suit", "tint": 0x5a7ee0, "price": 900},
	{"id": "mustard-kurta", "name": "Mustard kurta", "tint": 0xe0bb4a, "price": 750},
]
const STARTING_OUTFITS: Array[String] = ["everyday", "festival"]
const FREE_SOCKS := "socks"
const SNACKS: Array[Dictionary] = [
	{"id": "filter-coffee", "name": "Filter coffee", "price": 30, "health": 5},
	{"id": "corn-cup", "name": "Masala corn cup", "price": 40, "health": 10},
	{"id": "bajji-plate", "name": "Bajji plate", "price": 60, "health": 20},
]
const FILMS: Array[Dictionary] = [
	{
		"id": "sambar-sunday", "title": "Sambar Sunday", "genre": "Family comedy",
		"plot": "Three generations of one family fight over the last vada at a cousin's wedding lunch.",
		"runtime": 2.5,
		"scenes": ["Grandfather hides the vada inside his turban.", "The bride's uncle starts a sambar-tasting contest that nobody asked for."],
	},
	{
		"id": "roundtana-thunder", "title": "Roundtana Thunder", "genre": "Action drama",
		"plot": "A soft-spoken bus conductor stands up to the gang that hoards the neighbourhood's water tankers.",
		"runtime": 2.75,
		"scenes": ["The conductor stops a runaway tanker with one punch-ticket.", "Slow-motion walk through a water-pipe shower, three times."],
	},
	{
		"id": "filter-coffee-kadhal", "title": "Filter Coffee Kadhal", "genre": "Romance",
		"plot": "Two rival coffee-stall owners on the same street fall in love during a week of monsoon rain.",
		"runtime": 2.25,
		"scenes": ["A song in the rain, under one shared umbrella with a hole in it.", "They argue over chicory for ten full minutes, then hold hands."],
	},
]
const SHOWS: Array[float] = [11.0, 14.5, 18.5, 21.5]
const TICKET_PRICE := 150
const POPCORN_PRICE := 60
const POPCORN_HEALTH := 5
const AUDIENCE_MOMENTS := {
	"entry": "The hero's entry: the whole hall whistles, and paper confetti rains from the back rows.",
	"phone": "Someone's phone rings, loudly. He answers: \"I'm in the theatre, the hero just came. Call me at the interval.\"",
	"interval": "INTERVAL. Everyone rushes the snack counter at once, as if the popcorn might run out.",
	"end": "The credits roll and half the hall is already outside, discussing the climax.",
}
const SLEEP_UNTIL := 7.0
const TREATMENT_RATE := 3.0
const TREATMENT_MIN_FEE := 50
const TREATMENT_HOURS := 0.5
const FREE_QUEUE_HOURS := 3.0
const GYM_PASS := 50
const WORKOUT_HOURS := 1.0
const WORKOUT_REPS := 5
const WORKOUT_GOOD_NEEDED := 3
const MAX_FITNESS := 5
const FITNESS_SPRINT := 0.02
const WORKOUT_ZONE: Array[float] = [0.38, 0.62]
const NEEDLE_PERIOD := 1.6
const ESCALATOR_HOURS := 1.0 / 6.0

## The saved state: {day, fitness, trainedDay, outfit, owned, films, stories} (TS key names, so
## the `life` field of `cow-progress-v1` carries over).
var _s: Dictionary


func _init(saved: Variant = null) -> void:
	_s = parse_life(saved)


static func clock_text(hour: float) -> String:
	return RulesMath.clock_text(hour)


## Hours to wait from `hour` until the next show: {start, wait}.
static func next_show(hour: float) -> Dictionary:
	var h := RulesMath.wrap_hour(hour)
	var start: float = SHOWS[0]
	for s in SHOWS:
		if s >= h:
			start = s
			break
	return {"start": start, "wait": RulesMath.wrap_hour(start - h)}


## Hours of sleep from `hour` to the next SLEEP_UNTIL (a full day if it is exactly then).
static func sleep_hours(hour: float) -> float:
	var hours := RulesMath.wrap_hour(SLEEP_UNTIL - hour)
	return 24.0 if hours < 1e-6 else hours


## Fee by missing health, a minimum fee; free by ambulance or when healthy.
static func treatment_fee(health: float, by_ambulance: bool) -> int:
	var missing := clampf(MAX_HEALTH - health, 0.0, MAX_HEALTH)
	if missing < 1.0 or by_ambulance:
		return 0
	return maxi(TREATMENT_MIN_FEE, RulesMath.js_round_int(missing * TREATMENT_RATE))


static func sprint_factor(fitness: float) -> float:
	return 1.0 + clampi(floori(fitness), 0, MAX_FITNESS) * FITNESS_SPRINT


## Where the workout needle is, 0-1, `seconds` after the rep began (there and back).
static func needle_at(seconds: float) -> float:
	var phase := fmod(fmod(seconds / NEEDLE_PERIOD, 1.0) + 1.0, 1.0)
	return phase * 2.0 if phase < 0.5 else 2.0 - phase * 2.0


static func good_rep(needle: float) -> bool:
	return needle >= WORKOUT_ZONE[0] and needle <= WORKOUT_ZONE[1]


## Whole days passed when `hours` go by from `hour`.
static func days_passed(hour: float, hours: float) -> int:
	return floori((RulesMath.wrap_hour(hour) + maxf(0.0, hours)) / 24.0)


static func _strings(v: Variant) -> Array[String]:
	var out: Array[String] = []
	if v is Array:
		for x: Variant in v:
			if x is String:
				out.append(x)
	return out


static func _unique(list: Array[String]) -> Array[String]:
	var out: Array[String] = []
	for x in list:
		if not out.has(x):
			out.append(x)
	return out


static func _count(v: Variant, fallback: int) -> int:
	if (v is int or v is float) and not is_nan(float(v)) and not is_inf(float(v)):
		return floori(float(v))
	return fallback


static func _outfit_exists(id: String) -> bool:
	for o in OUTFITS:
		if o["id"] == id:
			return true
	return false


## A saved life state, tolerating anything missing or damaged (older saves have none).
static func parse_life(raw: Variant) -> Dictionary:
	var data: Dictionary = raw if raw is Dictionary else {}
	var owned: Array[String] = STARTING_OUTFITS.duplicate()
	owned.append_array(_strings(data.get("owned")))
	owned = _unique(owned)
	var outfit: Variant = data.get("outfit")
	var wear := "everyday"
	if outfit is String and owned.has(outfit) and _outfit_exists(outfit):
		wear = outfit
	return {
		"day": maxi(0, _count(data.get("day"), 0)),
		"fitness": clampi(_count(data.get("fitness"), 0), 0, MAX_FITNESS),
		"trainedDay": maxi(-1, _count(data.get("trainedDay"), -1)),
		"outfit": wear,
		"owned": owned,
		"films": _unique(_strings(data.get("films"))),
		"stories": _unique(_strings(data.get("stories"))),
	}


## The life state inside the stage save (`cow-progress-v1` keeps it under `life`).
static func life_from_save(saved: Variant) -> Dictionary:
	var record: Dictionary = saved if saved is Dictionary else {}
	return parse_life(record.get("life"))


## The stage save with this life state written in, every other field kept.
static func save_with_life(saved: Variant, life: Dictionary) -> Dictionary:
	var record: Dictionary = (saved as Dictionary).duplicate(true) if saved is Dictionary else {}
	record["life"] = life.duplicate(true)
	return record


func state() -> Dictionary:
	return _s


func day() -> int:
	return _s["day"]


func fitness() -> int:
	return _s["fitness"]


func outfit() -> Dictionary:
	for o in OUTFITS:
		if o["id"] == _s["outfit"]:
			return o
	return OUTFITS[0]


func sprint() -> float:
	return sprint_factor(_s["fitness"])


func owns(id: String) -> bool:
	return (_s["owned"] as Array).has(id)


## The clock moved on by itself from `from` to `to` (one fixed step): count midnight.
func tick(from: float, to: float) -> void:
	if to < from - 12.0:
		_s["day"] = int(_s["day"]) + 1


func _pass(hour: float, hours: float) -> void:
	var days := days_passed(hour, hours)
	if days > 0:
		_s["day"] = int(_s["day"]) + days


## `now`: {hour, money, health}.
func _done(now: Dictionary, message: String, hours: float, cost: int = 0, health: Variant = null) -> Dictionary:
	_pass(now["hour"], hours)
	var out := {"ok": true, "message": message, "cost": cost, "hours": hours}
	if health != null:
		out["health"] = health
	return out


func _refuse(message: String) -> Dictionary:
	return {"ok": false, "message": message, "cost": 0, "hours": 0.0}


static func now_of(hour: float, money: float = 1000, health: float = MAX_HEALTH) -> Dictionary:
	return {"hour": hour, "money": money, "health": health}


# Home ------------------------------------------------------------------------------------

func sleep(now: Dictionary) -> Dictionary:
	var hours := sleep_hours(now["hour"])
	return _done(now, "You sleep until %s. The neighbour's pressure cooker whistles you awake, fully rested. Game saved." % clock_text(SLEEP_UNTIL), hours, 0, MAX_HEALTH)


func change_clothes() -> Dictionary:
	var mine: Array[Dictionary] = []
	for o in OUTFITS:
		if owns(o["id"]):
			mine.append(o)
	var index := -1
	for i in mine.size():
		if mine[i]["id"] == _s["outfit"]:
			index = i
	var next: Dictionary = mine[(index + 1) % mine.size()] if mine.size() > 0 else OUTFITS[0]
	_s["outfit"] = next["id"]
	return {"ok": true, "message": "You change into the %s. Your mother says it needs ironing." % str(next["name"]).to_lower(), "cost": 0, "hours": 0.25}


# Hospital --------------------------------------------------------------------------------

func treat(now: Dictionary, by_ambulance: bool) -> Dictionary:
	if float(now["health"]) >= MAX_HEALTH - 0.5:
		return _refuse("The doctor checks you over: perfectly healthy. The nurse gives you a lollipop anyway.")
	var fee := treatment_fee(now["health"], by_ambulance)
	if fee > float(now["money"]):
		return _refuse("Treatment costs ₹%d and you have ₹%d. The free counter is always open, if you can wait." % [fee, floori(now["money"])])
	var message := "You came in with the ambulance, so the staff treat you free. A bandage, a tetanus shot and a lecture about helmets." if by_ambulance else "Bandaged and patched up for ₹%d. The doctor writes \"rest\" on the prescription in very large letters." % fee
	return _done(now, message, TREATMENT_HOURS, fee, MAX_HEALTH)


func free_queue(now: Dictionary) -> Dictionary:
	if float(now["health"]) >= MAX_HEALTH - 0.5:
		return _refuse("You are not ill. The man behind you in the queue asks if you will give him your token.")
	return _done(now, "Three hours, one token number and four new friends in the queue later, you are treated for free.", FREE_QUEUE_HOURS, 0, MAX_HEALTH)


# Gym -------------------------------------------------------------------------------------

func trained_today() -> bool:
	return _s["trainedDay"] == _s["day"]


func workout(now: Dictionary, good: float, free: bool = false) -> Dictionary:
	var cost := 0 if free else GYM_PASS
	if cost > float(now["money"]):
		return _refuse("A day pass is ₹%d. The trainer suggests push-ups at home." % GYM_PASS)
	var reps := clampi(floori(good), 0, WORKOUT_REPS)
	var message := ""
	if reps < WORKOUT_GOOD_NEEDED:
		message = "%d of %d good reps. The trainer says you lifted more selfies than weights. Not counted." % [reps, WORKOUT_REPS]
	elif trained_today():
		message = "%d of %d good reps. You already trained today: rest days build muscle too. Come back tomorrow." % [reps, WORKOUT_REPS]
	elif int(_s["fitness"]) >= MAX_FITNESS:
		_s["trainedDay"] = _s["day"]
		message = "%d of %d good reps. Already at top fitness: the trainer asks you to demonstrate for the new joiners." % [reps, WORKOUT_REPS]
	else:
		var f := int(_s["fitness"]) + 1
		_s["fitness"] = f
		_s["trainedDay"] = _s["day"]
		message = "%d of %d good reps. Fitness %d/%d: sprinting is %d%% faster." % [reps, WORKOUT_REPS, f, MAX_FITNESS, RulesMath.js_round_int((sprint_factor(f) - 1.0) * 100.0)]
	return _done(now, message, WORKOUT_HOURS, cost)


# Mall ------------------------------------------------------------------------------------

func escalator(now: Dictionary) -> Dictionary:
	return _done(now, "The escalator is jammed with families taking a group photo on every step. Ten minutes to go up one floor.", ESCALATOR_HOURS)


func buy_snack(now: Dictionary, id: String) -> Dictionary:
	for snack in SNACKS:
		if snack["id"] != id:
			continue
		if float(snack["price"]) > float(now["money"]):
			return _refuse("%s is ₹%d. You have ₹%d." % [snack["name"], snack["price"], floori(now["money"])])
		var health := minf(MAX_HEALTH, float(now["health"]) + float(snack["health"]))
		return _done(now, "%s: +%d health." % [snack["name"], snack["health"]], 0.1, snack["price"], health)
	return _refuse("Sold out.")


func buy_outfit(now: Dictionary, id: String) -> Dictionary:
	var outfit_item: Dictionary = {}
	for o in OUTFITS:
		if o["id"] == id and int(o["price"]) > 0:
			outfit_item = o
	if outfit_item.is_empty():
		return _refuse("Not for sale.")
	var lower := str(outfit_item["name"]).to_lower()
	if owns(id):
		return _refuse("You already own the %s." % lower)
	if float(outfit_item["price"]) > float(now["money"]):
		return _refuse("The %s is ₹%d. You have ₹%d." % [lower, outfit_item["price"], floori(now["money"])])
	var socks := not owns(FREE_SOCKS)
	(_s["owned"] as Array).append(id)
	if socks:
		(_s["owned"] as Array).append(FREE_SOCKS)
	_s["outfit"] = id
	var free := " BUY 1 GET 1*: your free item is a pair of socks (*see small print)." if socks else " The free item is socks again; you already have socks."
	return _done(now, "You buy the %s and wear it out of the shop.%s" % [lower, free], 0.25, outfit_item["price"])


# Cinema ----------------------------------------------------------------------------------

## Buy a ticket and watch: the outcome plus {lines, film}.
func watch(now: Dictionary, film_id: String, free: bool = false) -> Dictionary:
	var film: Dictionary = {}
	for f in FILMS:
		if f["id"] == film_id:
			film = f
	if film.is_empty():
		var refused := _refuse("No such film.")
		refused.merge({"lines": [], "film": null})
		return refused
	var cost := 0 if free else TICKET_PRICE
	if cost > float(now["money"]):
		var no_money := _refuse("A ticket is ₹%d. You have ₹%d." % [TICKET_PRICE, floori(now["money"])])
		no_money.merge({"lines": [], "film": film})
		return no_money
	var show := next_show(now["hour"])
	var hours: float = float(show["wait"]) + float(film["runtime"])
	if not (_s["films"] as Array).has(film["id"]):
		(_s["films"] as Array).append(film["id"])
	var wait := ("You wait in the lobby for the %s show." if float(show["wait"]) > 0.05 else "You walk in just as the %s show starts.") % clock_text(show["start"])
	var scenes: Array = film["scenes"]
	var lines: Array[String] = [
		"%s (%s). %s" % [film["title"], film["genre"], wait],
		AUDIENCE_MOMENTS["entry"],
		scenes[0] if scenes.size() > 0 else film["plot"],
		AUDIENCE_MOMENTS["phone"],
		AUDIENCE_MOMENTS["interval"],
		scenes[1] if scenes.size() > 1 else film["plot"],
		AUDIENCE_MOMENTS["end"],
	]
	var outcome := _done(now, "%s is over at %s." % [film["title"], clock_text(float(now["hour"]) + hours)], hours, cost)
	outcome.merge({"lines": lines, "film": film})
	return outcome


func popcorn(now: Dictionary) -> Dictionary:
	if POPCORN_PRICE > float(now["money"]):
		return _refuse("No money for popcorn. Your neighbour offers you one piece.")
	return _done(now, "Popcorn, ₹%d. By the time you are back, your neighbour has eaten a third of it." % POPCORN_PRICE, 0, POPCORN_PRICE, minf(MAX_HEALTH, float(now["health"]) + POPCORN_HEALTH))


func finish_story(id: String) -> void:
	if not (_s["stories"] as Array).has(id):
		(_s["stories"] as Array).append(id)


func reset() -> void:
	_s = parse_life(null)
