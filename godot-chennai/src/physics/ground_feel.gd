class_name GroundFeel
extends RefCounted
## What the surface under a vehicle does to it (decision G-450): the share of top speed kept, the
## grip multiplier, the bump amplitude in metres and whether it is in a puddle. Plain data the
## `RaycastVehicle` reads; whoever knows the road (the app's wiring) fills it in.

## 1 on good tar: the share of the spec's top speed the engine can still reach.
var top_speed: float = 1.0
## 1 on good tar: tyre grip, on both the friction limit and the sideways stiffness.
var grip: float = 1.0
## Vertical jostle amplitude of the surface, metres (0 on good tar).
var bump: float = 0.0
## In a puddle (splashes, slows a little).
var wet: bool = false


static func make(top: float, grip_mult: float, bump_m: float, in_puddle: bool = false) -> GroundFeel:
	var g := GroundFeel.new()
	g.top_speed = top
	g.grip = grip_mult
	g.bump = bump_m
	g.wet = in_puddle
	return g


func is_neutral() -> bool:
	return top_speed >= 1.0 and grip >= 1.0 and bump <= 0.0 and not wet
