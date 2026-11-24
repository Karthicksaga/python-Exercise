class_name MapProjection
extends RefCounted
## World metres to plate pixels for the minimap and the full map (G-281). World +X is east and +Z
## south (TD-2); a heading of 0 faces north (-Z) and a positive heading turns left. The plate's
## centre is `centre` (metres); with `rotate_with_heading` the way the player faces is up.
## Pure maths, so it is tested without a screen.

var centre := Vector2.ZERO
var heading := 0.0
var rotate_with_heading := true
var pixels_per_metre := 0.25


## The rotation that takes a world offset to a plate offset (0 when the map is north-up).
func angle() -> float:
	if not rotate_with_heading:
		return 0.0
	var forward := Vector2(-sin(heading), -cos(heading))
	return -PI / 2.0 - forward.angle()


## Pixels from the plate's centre for a world point.
func offset_of(p: Vector2) -> Vector2:
	return (p - centre).rotated(angle()) * pixels_per_metre


## The world point at a pixel offset from the plate's centre (the inverse).
func world_at(offset: Vector2) -> Vector2:
	return centre + (offset / pixels_per_metre).rotated(-angle())


## Where a marker is drawn on a round plate of `radius_px`: {at, inside, direction}. Beyond the
## edge it is pinned to it (`inset` px in) and `direction` is the way it lies, for an arrow.
func clamp_to_circle(p: Vector2, radius_px: float, inset: float) -> Dictionary:
	var off := offset_of(p)
	if off.length() <= radius_px - inset:
		return {"at": off, "inside": true, "direction": off.normalized() if off.length() > 0.001 else Vector2.UP}
	var dir := off.normalized()
	return {"at": dir * (radius_px - inset), "inside": false, "direction": dir}


## The same for a rectangular plate (the full map): pinned to the rectangle's edge.
func clamp_to_rect(p: Vector2, half: Vector2, inset: float) -> Dictionary:
	var off := offset_of(p)
	var room := half - Vector2(inset, inset)
	if absf(off.x) <= room.x and absf(off.y) <= room.y:
		return {"at": off, "inside": true, "direction": off.normalized() if off.length() > 0.001 else Vector2.UP}
	var k := minf(room.x / maxf(absf(off.x), 0.001), room.y / maxf(absf(off.y), 0.001))
	return {"at": off * k, "inside": false, "direction": off.normalized()}


## "420 m", "1.2 km", "12 km": whole metres below a kilometre, then one decimal below ten.
static func distance_text(metres: float) -> String:
	if metres < 1000.0:
		return "%d m" % (int(round(metres / 10.0)) * 10 if metres >= 100.0 else int(round(metres)))
	if metres < 10000.0:
		return "%.1f km" % (metres / 1000.0)
	return "%d km" % int(round(metres / 1000.0))
