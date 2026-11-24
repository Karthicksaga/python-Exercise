class_name VehicleType
extends RefCounted
## Everything about one vehicle kind besides its handling numbers (`spec`): seats, poses, doors,
## passengers, gears, crash rule, camera (decision G-72). The Three.js game's `VehicleType`
## (packages/vehicles/src/specs.ts) plus TD-29's crash rule; read by `VehicleCatalog`.
## Chassis frame: +X right, +Y up, -Z forwards, metres from the chassis centre.


## How the driver gets in and out (`Boarding`). India drives on the left, so car drivers get in
## on the right; the bus driver uses the kerb-side (left) front door.
class Entry:
	extends RefCounted
	## Side the driver gets in: 1 right, -1 left.
	var side: int = 1
	## Where the driver stands outside, on the ground (chassis x, z).
	var point: Vector2 = Vector2.ZERO
	## "hinged", "folding" or "none".
	var door: String = "none"
	## "door" (sit down through a doorway), "step" (open side), "swing" (a leg over the seat).
	var style: String = "door"
	## Standing points on the floor inside, walked between the door and the seat (the bus).
	var aisle: Array[Vector3] = []


## A door passengers use (fares, later phases).
class PassengerDoor:
	extends RefCounted
	var point: Vector2 = Vector2.ZERO
	var inside: Vector3 = Vector3.ZERO
	## Which door leaf swings for them (0 is the driver's); -1 for an open side.
	var leaf: int = -1


## A seated driver's pose relative to the hip joints (the Player solves it on the skeleton).
class RidePose:
	extends RefCounted
	## Torso tipped forwards, radians (negative leans back).
	var lean: float = 0.0
	## Right palm on the grip or wheel rim; the left mirrors it.
	var hand: Vector3 = Vector3.ZERO
	## Right ankle on the footboard, peg or pedal.
	var foot: Vector3 = Vector3.ZERO
	## Knee splay, 0 straight to 1 about 45°.
	var knees: float = 0.0
	## The steering's pivot relative to the hip joints (like `hand`), the axis it turns about
	## (chassis frame) and how far it turns per radian of front-wheel angle: 1 for handlebars, more
	## for a wheel. The palms follow it (G-261); the model's `steering` node turns with it.
	var hub: Vector3 = Vector3(0, 0.25, -0.42)
	var steer_axis: Vector3 = Vector3.UP
	var steer_ratio: float = 1.0
	## True once a model has measured hand, foot and hub from its own nodes (`VehicleModel`).
	var measured: bool = false


## What a hard impact does to the driver (TD-29).
class CrashRule:
	extends RefCounted
	## Impact (km/h) from which the driver is hurt but stays seated.
	var hurt_from: float = 25.0
	## Health lost per km/h above `hurt_from` while seated.
	var seated_damage: float = 0.35
	## Impact (km/h) from which the driver is thrown; negative: never.
	var throw_from: float = -1.0
	var throw_base: float = 0.0
	var throw_per_kmh: float = 0.0
	## "off" (off the seat) or "windscreen" (out through it).
	var style: String = "off"
	## The vehicle falls on its side when its rider comes off (two-wheelers).
	var topples: bool = false


## "car", "auto", "bike", "ambulance", "bus", "saloon", "suv", "coupe", "race".
var kind: StringName = &""
var label: String = ""
## Model id in `assets/vehicles/<model>.json`; `fallback_model` until it exists.
var model: String = ""
var fallback_model: String = ""
var spec: VehicleSpec
var ride_height: float = 0.7
var camera_distance: float = 8.0
## Hip joints of the driver relative to the chassis centre.
var driver: Vector3 = Vector3.ZERO
var pose: RidePose = RidePose.new()
## The rider can be seen (two-wheelers, the auto); closed bodies hide the driver.
var open_seat: bool = false
## Two-wheelers lean into corners (drawn only).
var leans: bool = false
## Forward gears shown on the HUD.
var gears: int = 5
var siren: bool = false
var premium: bool = false
var entry: Entry = Entry.new()
var passengers: Array[PassengerDoor] = []
## Every passenger seat's hip joints (chassis frame), in the model's order: where fares sit.
var seats: Array[Vector3] = []
var crash: CrashRule = CrashRule.new()


static func from_dict(id: StringName, d: Dictionary) -> VehicleType:
	var t := VehicleType.new()
	t.kind = id
	t.label = String(d["label"])
	t.model = String(d["model"])
	t.fallback_model = String(d.get("fallback_model", ""))
	t.spec = VehicleSpec.from_dict(d["physics"])
	t.ride_height = float(d["ride_height"])
	t.camera_distance = float(d["camera_distance"])
	t.gears = int(d["gears"])
	t.open_seat = bool(d.get("open_seat", false))
	t.leans = bool(d.get("leans", false))
	t.siren = bool(d.get("siren", false))
	t.premium = bool(d.get("premium", false))
	t.driver = _v3(d["driver"])
	var p: Dictionary = d["pose"]
	t.pose.lean = float(p["lean"])
	t.pose.hand = _v3(p["hand"])
	t.pose.foot = _v3(p["foot"])
	t.pose.knees = float(p.get("knees", 0.0))
	var e: Dictionary = d["entry"]
	t.entry.side = int(e["side"])
	t.entry.point = _v2(e["point"])
	t.entry.door = String(e["door"])
	t.entry.style = String(e["style"])
	for a: Array in e.get("aisle", []):
		t.entry.aisle.append(_v3(a))
	for pd: Dictionary in d.get("passengers", []):
		var door := PassengerDoor.new()
		door.point = _v2(pd["point"])
		door.inside = _v3(pd["inside"])
		door.leaf = int(pd.get("leaf", -1))
		t.passengers.append(door)
	var c: Dictionary = d["crash"]
	t.crash.hurt_from = float(c["hurt_from"])
	t.crash.seated_damage = float(c["seated_damage"])
	t.crash.throw_from = float(c["throw_from"])
	t.crash.throw_base = float(c["throw_base"])
	t.crash.throw_per_kmh = float(c["throw_per_kmh"])
	t.crash.style = String(c["style"])
	t.crash.topples = bool(c["topples"])
	return t


static func _v3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))


static func _v2(a: Array) -> Vector2:
	return Vector2(float(a[0]), float(a[1]))
