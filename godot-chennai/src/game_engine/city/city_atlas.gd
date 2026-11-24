class_name CityAtlas
extends RefCounted
## Layout of the baked city textures (`assets/city/textures/`, drawn by
## `tools/bake_city_textures.gd`), shared by the bake tool and the mesh builders so UVs and
## pictures always agree. Godot UVs: v = 0 is the top of the image.

const DIR := "res://assets/city/textures"

## Facade atlas: tiles side by side, one window bay of one floor each; tile t + LIT is the same
## picture whose glass glows after dark (`facade_glow.png`) (`FACADE_TILES` in `textures.ts`).
const TILE_WINDOW := 0
const TILE_BALCONY := 1
const TILE_DOOR := 2
const TILE_SHOP := 3
const LIT := 4
const FACADE_TILES := 8
const FACADE_TILE_PX := 256
## Keep samples away from tile edges so neighbouring tiles don't bleed in at a distance.
const INSET := 0.004
## Plain plaster: a blank corner of the window tile, for parapets and slabs.
const PLASTER := Vector2((TILE_WINDOW + 0.04) / FACADE_TILES, 0.14)

## Roof tiles: courses of clay tiles, the top band of each row pure white so flat roofs and
## water tanks sampling ROOF_PLAIN show their vertex colour unchanged.
const ROOF_PX := 128
const ROOF_PLAIN := Vector2(8.5 / 128.0, 35.5 / 128.0)

## Kit atlas (shop signs, shutters, interiors, railing), `kitAtlas.ts`, enlarged for the sign
## categories (G-192): 2 columns x 24 rows of category signs 512 x 88 px, then the cells.
const KIT_PX := 1024
const KIT_H := 2368
const SIGN_W := 512
const SIGN_ROW := 88
const SIGN_ROWS := 24
const SIGN_CAPACITY := 48
const CELL_Y := SIGN_ROW * SIGN_ROWS
const CELL_H := KIT_H - CELL_Y
const KIT_SHUTTER := Rect2i(0, CELL_Y, 256, CELL_H)
const KIT_LIT := Rect2i(256, CELL_Y, 256, CELL_H)
const KIT_DARK := Rect2i(512, CELL_Y, 256, CELL_H)
const KIT_RAILING := Rect2i(768, CELL_Y, 256, CELL_H / 2)
const KIT_PLAIN := Rect2i(768, CELL_Y + CELL_H / 2, 256, CELL_H / 2)

## Ground atlas: one 256 px tile per layer, repeated inside its tile by `ground.gdshader`.
const GROUND_ASPHALT := 0
const GROUND_PAVING := 1
const GROUND_GRASS := 2
const GROUND_SAND := 3
const GROUND_WATER := 4
const GROUND_PAINT := 5
const GROUND_KERB := 6
const GROUND_EARTH := 7
const GROUND_TILES := 8
const GROUND_TILE_PX := 256


## Pixel rectangle of the sign of a category id (1-based).
static func sign_rect(category: int) -> Rect2i:
	var i := clampi(category - 1, 0, SIGN_CAPACITY - 1)
	return Rect2i((i % 2) * SIGN_W, (i / 2) * SIGN_ROW, SIGN_W, SIGN_ROW)


## UVs of a kit rectangle inset 2 px against bleeding: x = u0, y = u1, z = v top, w = v bottom.
static func kit_uv(r: Rect2i) -> Vector4:
	return Vector4((r.position.x + 2.0) / KIT_PX, (r.end.x - 2.0) / KIT_PX, (r.position.y + 2.0) / KIT_H, (r.end.y - 2.0) / KIT_H)
