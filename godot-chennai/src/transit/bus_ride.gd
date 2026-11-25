class_name BusRide
extends RefCounted
## The player riding a city bus as a passenger (decision G-216): board at a stop while a bus of a
## route stands there with its doors open, pay the ticket (`TransitFare`), ride, hear the next stop
## announced in Tamil and English (text now, sound later), and alight when the bus stands at a
## stop (or at the last one, where everyone gets off). Boarding is refused on a crash, while
## wanted, or when the player cannot pay. Pure logic, no nodes: the game feeds it the bus's state
## from `RouteBuses.snapshot()` and draws what it says.

const NONE := 0
const RIDING := 1
## "Next stop" in Tamil (needs native review).
const NEXT_TA := "அடுத்த நிறுத்தம்"
const NEXT_EN := "Next stop"
const LAST_TA := "கடைசி நிறுத்தம்"
const LAST_EN := "Last stop"

var state: int = NONE
var route: TransitNetwork.Route = null
var network: TransitNetwork = null
## The traffic agent of the bus.
var agent_id: int = -1
## Stop numbers on the route: where the player got on, and the next the bus calls at.
var from_stop: int = -1
var next_stop: int = -1
var fare: int = 0
var _announced: int = -1


static func make(net: TransitNetwork) -> BusRide:
	var r := BusRide.new()
	r.network = net
	return r


## Why the player cannot board now ("" when they can).
static func board_block(on_foot: bool, wanted: int, crashed: bool, balance: float, price: int) -> String:
	if crashed:
		return "Not now: you are hurt."
	if wanted > 0:
		return "The conductor will not let you on while the police want you."
	if not on_foot:
		return "Get out of the vehicle first."
	if balance < price:
		return "The ticket is ₹%d and you have ₹%d." % [price, floori(balance)]
	return ""


func riding() -> bool:
	return state == RIDING


## Board the bus `agent_id` of `r` standing at its stop number `stop`. Returns {ok, fare, title,
## detail}; the caller charges `fare` and shows the toast.
func board(r: TransitNetwork.Route, stop: int, id: int, balance: float, wanted: int = 0, crashed: bool = false, on_foot: bool = true) -> Dictionary:
	var price := TransitFare.ticket_on(r, stop)
	var why := board_block(on_foot, wanted, crashed, balance, price)
	if why != "":
		return {"ok": false, "fare": 0, "title": "Cannot board", "detail": why}
	state = RIDING
	route = r
	agent_id = id
	from_stop = stop
	next_stop = stop + 1
	fare = price
	_announced = -1
	var dest := r.to_name if r.to_name != "" else "the last stop"
	return {"ok": true, "fare": price, "title": "Ticket ₹%d" % price, "detail": "Route %s to %s" % [r.ref, dest]}


## Feed the bus's state ({doors, state, next, stop} from `RouteBuses.snapshot()`, or {} when the
## bus is gone). Returns events: {type: "announce", en, ta, last}, {type: "at_stop", stop},
## {type: "terminus"}, {type: "lost"}.
func update(bus: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if state != RIDING:
		return out
	if bus.is_empty():
		out.append({"type": "lost"})
		return out
	var n := int(bus.get("next", next_stop))
	var standing := int(bus.get("state", RouteBuses.DRIVING)) != RouteBuses.DRIVING
	if standing and n > from_stop and n < route.stops.size():
		out.append({"type": "at_stop", "stop": n})
		if n == route.stops.size() - 1:
			out.append({"type": "terminus"})
	if not standing and n != _announced and n < route.stops.size() and n > from_stop:
		next_stop = n
		_announced = n
		out.append(announcement(n))
	return out


## The announcement for stop number n: English and Tamil lines.
func announcement(n: int) -> Dictionary:
	var s := network.stops[route.stops[n]]
	var last := n == route.stops.size() - 1
	var en_name := s.name if s.name != "" else s.name_ta
	var ta_name := s.name_ta if s.name_ta != "" else en_name
	return {"type": "announce", "last": last,
		"en": "%s: %s" % [LAST_EN if last else NEXT_EN, en_name],
		"ta": "%s: %s" % [LAST_TA if last else NEXT_TA, ta_name]}


## True when the player may get off now: the bus stands at a stop after the one they boarded at.
func can_alight(bus: Dictionary) -> bool:
	if state != RIDING or bus.is_empty():
		return state == RIDING
	var standing := int(bus.get("state", RouteBuses.DRIVING)) != RouteBuses.DRIVING
	return standing and float(bus.get("doors", 0.0)) > 0.6 and int(bus.get("next", 0)) > from_stop


## Off the bus: returns the stop the player stands at (or null when the bus was lost).
func alight(bus: Dictionary) -> TransitNetwork.Stop:
	var n := int(bus.get("next", next_stop)) if not bus.is_empty() else -1
	state = NONE
	var at: TransitNetwork.Stop = null
	if route != null and n >= 0 and n < route.stops.size():
		at = network.stops[route.stops[n]]
	route = null
	agent_id = -1
	return at
