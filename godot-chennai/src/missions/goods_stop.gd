## Goods handed over at a pick-up or drop (port of `missions/src/goods.ts`): someone waits at
## the kerb, walks to the vehicle once it has stopped and puts the goods in (or takes them out);
## only then is the stop done. One person per stop, one trip. Times are estimates.
class_name GoodsStop
extends RefCounted

## Seconds at the vehicle to hand the goods over, by vehicle; share of it at which they swap.
const HAND := {"auto": 1.4, "car": 1.8, "ambulance": 1.8, "bus": 1.4, "bike": 1.6}
const SWAP := 0.5
## The translation keys of each goods' words: [one, several] ("the parcel", "the parcels"), and the
## same with a capital for the start of a line.
const NAME_KEYS := {
	"parcel": ["goods.parcel.one", "goods.parcel.other"],
	"food-bag": ["goods.food-bag.one", "goods.food-bag.other"],
	"tiffin": ["goods.tiffin.one", "goods.tiffin.other"],
	"medicine": ["goods.medicine.one", "goods.medicine.other"],
	"cash-bag": ["goods.cash-bag.one", "goods.cash-bag.other"],
	"harmonium": ["goods.harmonium.one", "goods.harmonium.other"],
	"vessel": ["goods.vessel.one", "goods.vessel.other"],
}
const CAP_KEYS := {
	"parcel": ["goods.cap.parcel.one", "goods.cap.parcel.other"],
	"food-bag": ["goods.cap.food-bag.one", "goods.cap.food-bag.other"],
	"tiffin": ["goods.cap.tiffin.one", "goods.cap.tiffin.other"],
	"medicine": ["goods.cap.medicine.one", "goods.cap.medicine.other"],
	"cash-bag": ["goods.cap.cash-bag.one", "goods.cap.cash-bag.other"],
	"harmonium": ["goods.cap.harmonium.one", "goods.cap.harmonium.other"],
	"vessel": ["goods.cap.vessel.one", "goods.cap.vessel.other"],
}

var goods: MissionData.Goods
var vehicle: String
var _t := 0.0
var _walk := 0.0
var _hand: float


func _init(g: MissionData.Goods, kind: String) -> void:
	goods = g
	vehicle = kind
	_hand = HAND[kind]


func started() -> bool:
	return _t > 0.0


func done() -> bool:
	return _walk > 0.0 and _t >= _walk + _hand


## The goods are in the vehicle (loaded) or out of it (unloaded) already.
func swapped() -> bool:
	return _walk > 0.0 and _t >= _walk + _hand * SWAP


func step(dt: float, ready: bool, x: float, z: float) -> bool:
	if done():
		return true
	var at_vehicle := _walk > 0.0 and _t >= _walk
	if at_vehicle:
		_t += dt
	elif ready:
		if _t == 0.0:
			_walk = FareStop.walk_time(maxf(0.0, RulesMath.hypot(x - goods.kerb_x, z - goods.kerb_z) - float(FareStop.FARES["door_offset"])))
		_t += dt
	elif _t > 0.0:
		_t = maxf(0.0, _t - dt)
	return done()


## {stage, share, walk_seconds, holder}; holder is "hands" or "vehicle".
func person() -> Dictionary:
	var loaded := goods.action == "load"
	var holder := "vehicle" if swapped() == loaded else "hands"
	var base := {"walk_seconds": _walk, "holder": holder, "stage": "done", "share": 0.0}
	if _t <= 0.0 or _walk <= 0.0:
		base["stage"] = "waiting"
	elif _t < _walk:
		base["stage"] = "walking"
		base["share"] = _t / _walk
	elif _t < _walk + _hand:
		base["stage"] = "handing"
		base["share"] = (_t - _walk) / _hand
	return base


## A line for the HUD while the goods change hands, or "".
func note() -> String:
	if not started() or done():
		return ""
	return Tr.line("goods.loading" if goods.action == "load" else "goods.collecting", [Tr.ref(_name_key(goods.items, CAP_KEYS, "goods.cap.the_goods"))])


## "the parcel", "the lunch boxes", for the HUD.
static func goods_name(items: Array[String]) -> String:
	return Tr.line(_name_key(items, NAME_KEYS, "goods.the_goods"))


static func _name_key(items: Array[String], table: Dictionary, several_kinds: String) -> String:
	var kinds := {}
	for i in items:
		kinds[i] = true
	if kinds.size() != 1:
		return several_kinds
	var keys: Array = table[items[0]]
	return str(keys[1 if items.size() > 1 else 0])


## What is in the vehicle now, in drop order: everything still to be dropped at this or a
## later stop, less what is still to be loaded. `stops`: each stop's goods or null.
static func cargo_aboard(stops: Array, index: int, current: GoodsStop) -> Array[String]:
	var aboard: Array[String] = []
	var to_load := {}
	for i in range(maxi(0, index), stops.size()):
		var g: MissionData.Goods = stops[i]
		if g == null:
			continue
		var here := i == index
		var was_swapped := here and current != null and current.goods == g and current.swapped()
		if g.action == "unload":
			if g.aboard == "here" and not here:
				continue
			if not was_swapped:
				aboard.append_array(g.items)
		elif not was_swapped:
			for item in g.items:
				to_load[item] = int(to_load.get(item, 0)) + 1
	var i := aboard.size() - 1
	while i >= 0:
		var item := aboard[i]
		var n: int = to_load.get(item, 0)
		if n > 0:
			to_load[item] = n - 1
			aboard.remove_at(i)
		i -= 1
	return aboard
