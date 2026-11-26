class_name Gearbox
extends RefCounted
## The driver's gear selector, like an automatic: P (park), R (reverse), D (drive), plus the
## accelerator and brake (decision G-74; a port of the Three.js `Gearbox.ts`).
##
## - D: GAS drives forwards, BRAKE brakes (and holds the vehicle once stopped).
## - R: GAS drives backwards, BRAKE brakes.
## - P: the vehicle is held still; GAS does nothing.
## - Changing gear needs the vehicle nearly stopped. Asked for while moving, the gearbox brakes
##   first and shifts once stopped (N on the HUD meanwhile); asking for the gear already engaged
##   cancels that.

## Below this speed (m/s, about 4 km/h) the vehicle counts as stopped and can change gear.
const SHIFT_SPEED := 1.0
const HOLD := 1.0


## Physics controls for one step.
class Controls:
	extends RefCounted
	var throttle: float = 0.0
	var steer: float = 0.0
	var brake: float = 0.0

	func _init(t: float = 0.0, s: float = 0.0, b: float = 0.0) -> void:
		throttle = t
		steer = s
		brake = b


## The gear engaged now: "P", "R" or "D".
var gear: String = "D"
## The gear asked for while still moving, engaged once stopped; "" when none.
var pending: String = ""
var _hint: String = ""
var _gas_before := false
var _throttle := 0.0


func _init(start: String = "D") -> void:
	gear = start


## Start over in this gear, nothing pending (getting in or out).
func reset(start: String) -> void:
	gear = start
	pending = ""
	_hint = ""
	_gas_before = false
	_throttle = 0.0


## Ask for a gear. Engaged at once when nearly stopped; otherwise brakes first.
func select(wanted: String, forward_speed: float) -> void:
	if wanted == gear:
		pending = ""
		return
	if absf(forward_speed) < SHIFT_SPEED:
		gear = wanted
		pending = ""
		return
	if pending != wanted:
		_hint = Tr.t("gear.stopping", [wanted])
	pending = wanted


## Engage `g` at once, whatever the speed, nothing pending: for reverse-on-hold (`ReverseHold`), where
## the rule that the vehicle has stopped is already the hold's own (G-175).
func set_now(g: String) -> void:
	gear = g
	pending = ""


## Physics controls for one fixed step from what the player holds.
func controls(gas: bool, brake: bool, steer: float, forward_speed: float) -> Controls:
	var stopped := absf(forward_speed) < SHIFT_SPEED
	if pending != "" and stopped:
		gear = pending
		pending = ""
	var out: Controls
	if pending != "" or gear == "P":
		if gear == "P" and gas and not _gas_before:
			_hint = Tr.t("gear.in_p")
		out = Controls.new(0.0, steer, HOLD)
	else:
		var direction := -1.0 if gear == "R" else 1.0
		out = Controls.new(direction if gas else 0.0, steer, 1.0 if brake else 0.0)
	_gas_before = gas
	_throttle = out.throttle
	return out


## A short message for the player (shift refused or delayed), once; then "".
func consume_hint() -> String:
	var h := _hint
	_hint = ""
	return h


## The HUD's gear: P, R, N while a change waits for the vehicle to stop, D when stopped in
## drive, or D with the gear a driver would be in at this speed (D1, D2…).
func label(type: VehicleType, forward_speed: float) -> String:
	if pending != "":
		return "N"
	if gear != "D":
		return gear
	var g := gear_for(type, maxf(0.0, forward_speed), maxf(0.0, _throttle))
	return "D" + g if g.is_valid_int() else "D"


## Gear for this speed: R reversing, N stopped, else the share of top speed in `gears` steps.
static func gear_for(type: VehicleType, forward_speed: float, throttle: float) -> String:
	if forward_speed < -0.4 or (throttle < 0.0 and forward_speed < 0.4):
		return "R"
	if absf(forward_speed) < 0.4 and throttle <= 0.0:
		return "N"
	var share := maxf(0.0, forward_speed) / type.spec.max_speed
	return str(mini(type.gears, 1 + floori(share * type.gears * 1.05)))


## True when the HUD gear went up a forward gear (2 → 3, or D2 → D3), for the gear-change sound.
static func shifted_up(from: String, to: String) -> bool:
	var a := from.trim_prefix("D") if from.length() > 1 else from
	var b := to.trim_prefix("D") if to.length() > 1 else to
	return from != "" and a.is_valid_int() and b.is_valid_int() and int(a) >= 1 and int(b) > int(a)
