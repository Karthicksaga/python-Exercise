## A zone that grows or moves with game time (G-143): flood water in an underpass, a procession
## filling a road, a strike's blocked arterial. Pure logic over game time and the rain level.
## Driving into it slows the vehicle; deep water stalls it. (Re-planning routes around it needs the
## road graph: the zone only says where it is and what it does; the player or the AI chooses.)
class_name HazardZone
extends RefCounted

## "flood", "procession" or "strike".
var kind := "flood"
var label := ""
var x := 0.0
var z := 0.0
var radius := 20.0
## Radius growth in m/s from `start`, up to `max_radius`.
var growth := 0.0
var max_radius := 20.0
## Drift of the centre in m/s.
var vx := 0.0
var vz := 0.0
## Game seconds after the objective began when it appears.
var start := 0.0
## Flood: the deepest water (m) it reaches, how fast it rises (m/s), and whether rain feeds it
## (the water rises by `rain_scale(rain)` of its rate).
var max_depth := 0.0
var rise := 0.0
## Vehicles slow to this fraction of their speed at depth DEEP_SLOW, and stall from STALL_DEPTH.
const SLOW_FROM := 0.1
const DEEP_SLOW := 0.35
const SLOW_TO := 0.35
const STALL_DEPTH := 0.5
## Non-flood zones: the speed fraction inside (a procession crawls, a strike blocks).
var inside_scale := 0.4
var blocks := false


static func from_dict(d: Dictionary) -> HazardZone:
	var h := HazardZone.new()
	h.kind = MissionData._s(d, "kind", "flood")
	h.label = MissionData._s(d, "label")
	h.x = MissionData._f(d, "x")
	h.z = MissionData._f(d, "z")
	h.radius = MissionData._f(d, "radius", 20.0)
	h.growth = MissionData._f(d, "growth")
	h.max_radius = MissionData._f(d, "maxRadius", h.radius)
	h.vx = MissionData._f(d, "vx")
	h.vz = MissionData._f(d, "vz")
	h.start = MissionData._f(d, "start")
	h.max_depth = MissionData._f(d, "maxDepth")
	h.rise = MissionData._f(d, "rise")
	h.inside_scale = MissionData._f(d, "insideScale", 0.4)
	h.blocks = bool(d.get("blocks", false))
	return h


static func rain_scale(rain: float) -> float:
	return 0.5 + 0.5 * clampf(rain, 0.0, 1.0)


func active(t: float) -> bool:
	return t >= start


func radius_at(t: float) -> float:
	if t < start:
		return 0.0
	return minf(max_radius, radius + growth * (t - start))


func centre_at(t: float) -> Vector2:
	var dt := maxf(0.0, t - start)
	return Vector2(x + vx * dt, z + vz * dt)


## Water depth (m) at a point: deepest at the centre, falling to 0 at the edge.
func depth_at(px: float, pz: float, t: float, rain: float = 1.0) -> float:
	if kind != "flood" or t < start:
		return 0.0
	var r := radius_at(t)
	if r <= 0.0:
		return 0.0
	var d := centre_at(t).distance_to(Vector2(px, pz))
	if d >= r:
		return 0.0
	var peak := minf(max_depth, rise * rain_scale(rain) * (t - start))
	return peak * (1.0 - d / r)


func inside(px: float, pz: float, t: float) -> bool:
	return t >= start and centre_at(t).distance_to(Vector2(px, pz)) < radius_at(t)


## What it does to a vehicle at a point: {inside, speed_scale (1 = free), stalled, depth}.
func effect(px: float, pz: float, t: float, rain: float = 1.0) -> Dictionary:
	if not inside(px, pz, t):
		return {"inside": false, "speed_scale": 1.0, "stalled": false, "depth": 0.0}
	if kind == "flood":
		var depth := depth_at(px, pz, t, rain)
		if depth >= STALL_DEPTH:
			return {"inside": true, "speed_scale": 0.0, "stalled": true, "depth": depth}
		var scale := 1.0
		if depth > SLOW_FROM:
			scale = lerpf(1.0, SLOW_TO, clampf((depth - SLOW_FROM) / (DEEP_SLOW - SLOW_FROM), 0.0, 1.0))
		return {"inside": true, "speed_scale": scale, "stalled": false, "depth": depth}
	if blocks:
		return {"inside": true, "speed_scale": 0.0, "stalled": false, "depth": 0.0}
	return {"inside": true, "speed_scale": inside_scale, "stalled": false, "depth": 0.0}


## Whether a straight run a to b crosses a zone that blocks or stalls (sampled every 5 m): for the
## minimap's red route hint and for an AI that will use the road graph later.
func blocks_segment(a: Vector2, b: Vector2, t: float, rain: float = 1.0) -> bool:
	var length := a.distance_to(b)
	var steps := maxi(1, ceili(length / 5.0))
	for i in steps + 1:
		var p := a.lerp(b, float(i) / float(steps))
		var e := effect(p.x, p.y, t, rain)
		if bool(e["stalled"]) or (bool(e["inside"]) and blocks):
			return true
	return false
