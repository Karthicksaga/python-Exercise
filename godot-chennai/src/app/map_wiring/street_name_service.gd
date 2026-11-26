class_name StreetNameService
extends RefCounted
## Centralized event-driven street, locality, and navigation state service.
## Polled at ~4 Hz from `MissionsLayer` so no expensive spatial scans run per frame.

signal on_street_entered(street_name: String, locality_name: String, locality_ta: String)
signal on_locality_entered(locality_name: String, locality_ta: String)
signal on_road_changed(road_info: Dictionary)
signal on_destination_selected(place: Dictionary)
signal on_route_changed(route: Dictionary)

const CHECK_INTERVAL := 0.25
const BANNER_COOLDOWN := 3.5

var geo: ChennaiGeoIndex = null
var current_street := ""
var current_street_ta := ""
var current_locality := ""
var current_locality_ta := ""
var current_road_info: Dictionary = {}
var active_destination: Dictionary = {}
var active_route: Dictionary = {}

var _accum := 0.0
var _last_street_banner_t := -10.0
var _last_loc_banner_t := -10.0
var _elapsed := 0.0


func update_player(dt: float, pos: Vector2, silent: bool = false) -> void:
	_elapsed += dt
	_accum += dt
	if not silent and _accum < CHECK_INTERVAL:
		return
	_accum = 0.0
	if geo == null or not geo.loaded:
		return

	var loc := geo.identify_locality(pos)
	var loc_name := str(loc.get("name", "Chennai"))
	var loc_ta := str(loc.get("name_ta", ""))
	if loc_name != current_locality:
		current_locality = loc_name
		current_locality_ta = loc_ta
		if not silent and (_elapsed - _last_loc_banner_t) >= BANNER_COOLDOWN:
			_last_loc_banner_t = _elapsed
			on_locality_entered.emit(loc_name, loc_ta)

	var road := geo.identify_street(pos, current_street)
	var sname := str(road.get("name", ""))
	if sname == "":
		var ref := str(road.get("ref", ""))
		sname = ref
	if sname != "" and sname != current_street:
		current_street = sname
		current_street_ta = str(road.get("name_ta", ""))
		current_road_info = road
		on_road_changed.emit(road)
		if not silent and (_elapsed - _last_street_banner_t) >= BANNER_COOLDOWN:
			_last_street_banner_t = _elapsed
			on_street_entered.emit(sname, current_locality, current_locality_ta)


func set_destination(place: Dictionary) -> void:
	active_destination = place
	on_destination_selected.emit(place)


func set_route(route: Dictionary) -> void:
	active_route = route
	on_route_changed.emit(route)


func clear_route() -> void:
	active_destination = {}
	active_route = {}
	on_route_changed.emit({})
