class_name HomePrices
extends RefCounted
## Every price of the homes feature (G-231): homes, extensions and furniture, read from one file
## the owner can tune (`data/homes/prices.json`). The file holds the prototype's prices; the game
## charges `price x scale`, rounded to `round_to` and never under `minimum`, so one constant
## (`scale`) makes the whole feature cheaper or dearer. Pure logic.

const PATH := "res://data/homes/prices.json"

var scale: float = 0.05
var round_to: int = 5
var minimum: int = 5
## Share of the price paid back when furniture is removed.
var refund_share: float = 0.5
var extension_each: int = 20000
var max_extensions: int = 2
var homes: Dictionary[String, int] = {}
var props: Dictionary[String, int] = {}
var error: String = ""


static func load_file(path: String = PATH) -> HomePrices:
	var p := HomePrices.new()
	var d := HomeJson.read(path)
	if d.is_empty():
		p.error = "cannot read %s" % path
		return p
	p.scale = maxf(0.0, HomeJson.float_of(d, "scale", p.scale))
	p.round_to = maxi(1, HomeJson.int_of(d, "round_to", p.round_to))
	p.minimum = maxi(0, HomeJson.int_of(d, "minimum", p.minimum))
	p.refund_share = clampf(HomeJson.float_of(d, "refund", p.refund_share), 0.0, 1.0)
	p.extension_each = maxi(0, HomeJson.int_of(d, "extension_each", p.extension_each))
	p.max_extensions = maxi(0, HomeJson.int_of(d, "max_extensions", p.max_extensions))
	var h := HomeJson.dict_of(d, "homes")
	for k: Variant in h:
		p.homes[str(k)] = int(h[k])
	var pr := HomeJson.dict_of(d, "props")
	for k: Variant in pr:
		p.props[str(k)] = int(pr[k])
	return p


## A prototype-scale price as the game charges it.
func scaled(proto: int) -> int:
	var raw := float(proto) * scale / float(round_to)
	return maxi(minimum, roundi(raw) * round_to)


func home(type_id: String) -> int:
	return scaled(homes.get(type_id, 0))


func prop(prop_id: String) -> int:
	return scaled(props.get(prop_id, 0))


## What removing a piece pays back.
func refund(prop_id: String) -> int:
	return floori(float(prop(prop_id)) * refund_share)


## The cost of the next extension when `done` have been built (20,000 x n at the prototype scale).
func extension(done: int) -> int:
	return scaled(extension_each * (done + 1))
