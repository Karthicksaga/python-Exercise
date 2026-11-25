class_name TreeAtlas
extends RefCounted
## The tree atlas (G-380): ONE 1024x512 texture holding every leaf card, frond, flower and the
## bark. `assets/trees/atlas_layout.json` (written by `tools/trees/bake_tree_atlas.py`) names the
## rectangles in pixels; this class turns them into UV rectangles, inset by a few pixels so a mip
## level never reads the next tile. The PNG is VRAM-compressed on import (ETC2/ASTC on Android).

const PNG := "res://assets/trees/tree_atlas.png"
const LAYOUT := "res://assets/trees/atlas_layout.json"
## Pixels kept off every tile edge (the painter also leaves a clear border).
const INSET := 4.0
## Video memory the atlas may use, bytes (the budget test holds it under this).
const BUDGET_BYTES := 1_500_000

var size: Vector2 = Vector2(1024, 512)
var tiles: Dictionary[StringName, Rect2] = {}
var error: String = ""


static func load_layout() -> TreeAtlas:
	var a := TreeAtlas.new()
	var text := FileAccess.get_file_as_string(LAYOUT)
	var json := JSON.new()
	if text.is_empty() or json.parse(text) != OK or typeof(json.data) != TYPE_DICTIONARY:
		a.error = "%s: unreadable" % LAYOUT
		return a
	var d: Dictionary = json.data
	var sz: Array = d.get("size", [1024, 512])
	a.size = Vector2(float(sz[0]), float(sz[1]))
	var list: Dictionary = d.get("tiles", {})
	for k: String in list:
		var r: Array = list[k]
		a.tiles[StringName(k)] = Rect2(float(r[0]), float(r[1]), float(r[2]), float(r[3]))
	return a


## The tile's UV rectangle (position = top-left, size), inset.
func uv(tile: StringName) -> Rect2:
	var r: Rect2 = tiles.get(tile, Rect2(0, 0, 8, 8))
	return Rect2((r.position + Vector2(INSET, INSET)) / size, (r.size - Vector2(INSET, INSET) * 2.0) / size)


func has_tile(tile: StringName) -> bool:
	return tiles.has(tile)


## Video memory of the atlas as compressed (ETC2 or ASTC 4x4 RGBA: one byte a pixel) with its
## mip chain, bytes.
func vram_bytes() -> int:
	return int(size.x * size.y * 1.34)
