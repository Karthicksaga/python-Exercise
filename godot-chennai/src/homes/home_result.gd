class_name HomeResult
extends RefCounted
## What a home action did, for the caller to apply to the wallet: `delta` is the change in
## rupees (negative: the player pays, positive: a refund). A refused action changes nothing.

var ok: bool = false
## Why it was refused: a code (&"poor", &"taken", &"outside", &"doorway", &"unknown", &"limit",
## &"nothing", &"owned", &"blocked") with plain English and Tamil lines for a toast.
var code: StringName = &""
var reason: String = ""
var reason_ta: String = ""
var delta: int = 0
## The piece placed, turned or removed (null for the other actions).
var item: PlacedProp = null


static func done(delta_: int = 0, item_: PlacedProp = null) -> HomeResult:
	var r := HomeResult.new()
	r.ok = true
	r.delta = delta_
	r.item = item_
	return r


static func refused(code_: StringName, reason_: String, reason_ta_: String = "") -> HomeResult:
	var r := HomeResult.new()
	r.code = code_
	r.reason = reason_
	r.reason_ta = reason_ta_
	return r
