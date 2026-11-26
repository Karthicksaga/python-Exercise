class_name TrainService
extends RefCounted
## The railway as a passenger sees it (decision G-217): which lines call at a station, when the
## next train is due (`TransitTimetable.train_minutes`, estimated headways), and boarding a train.
## Trains themselves are phase 6 and are **not built**: this is the interface the train runtime
## will implement, with a stub that says so. `docs/transit.md` has the plan.
##
## The phase-6 runtime extends this class and overrides `has_trains`, `train_at` and `board`;
## everything else (the station place, the HUD hint, the timetable) already works against it.

var network: TransitNetwork


static func stub(net: TransitNetwork) -> TrainService:
	var s := TrainService.new()
	s.network = net
	return s


## True once trains run in the game (phase 6). The stub: false.
func has_trains() -> bool:
	return false


## Lines calling at a station, each {line: TrainLine, number: the station's place on it,
## minutes: to the next train there at `hour`}, soonest first.
func departures(station: TransitNetwork.Station, hour: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for id in station.lines:
		var ln := network.line(id)
		if ln == null:
			continue
		var k := ln.stations.find(station.index)
		if k < 0:
			continue
		out.append({"line": ln, "number": k, "minutes": TransitTimetable.train_minutes(ln, k, hour)})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["minutes"]) < float(b["minutes"]))
	return out


## The train of `line` standing at the station's platform now, or null (the stub: never).
func train_at(_station: TransitNetwork.Station, _line: TransitNetwork.TrainLine) -> RefCounted:
	return null


## Board a train of `line` at `station` for `to` (a station on the line). {ok, fare, title, detail}.
func board(_station: TransitNetwork.Station, _line: TransitNetwork.TrainLine, _to: TransitNetwork.Station, _balance: float) -> Dictionary:
	return {"ok": false, "fare": 0, "title": "No trains yet", "detail": "Trains start running in a later update."}


## Rupees for a ride of `stations` stops (suburban second class is cheap; the Metro dearer). Estimates.
static func fare(system: StringName, stations: int) -> int:
	match system:
		&"metro":
			return clampi(10 + 5 * ((stations + 1) / 2), 10, 50)
		_:
			return clampi(5 + 5 * (stations / 6), 5, 15)
